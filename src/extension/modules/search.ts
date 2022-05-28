'use strict';

import type {
  CancellationToken,
  CompletionContext,
  CompletionItemProvider,
  ExtensionContext,
  FindTextInFilesOptions,
  LocationLink,
  Position,
  TextDocument,
  TextSearchMatch,
  TextSearchQuery,
  TextSearchResult,
  Uri,
} from 'vscode';
import {
  commands,
  CompletionItem,
  CompletionItemKind,
  languages,
  Location,
  Range,
  SnippetString,
  workspace,
} from 'vscode';
import {
  assertNotNull,
  CheckError,
  checkNotNull,
} from '../../library/exception';
import { log } from '../../library/logging';
import { abbrevMatch } from '../../library/stringUtils';
import { locationOrLink } from '../utils/document';
import { getDocumentSymbolsFromCtags } from './ctags';
import { selectMultiple } from './dialog';
import { getCompletionPrefix } from './documentUtils';
import { registerAsyncCommandWrapped } from './exception';
import { getGtagsDefinitionsInWorkspace } from './gtags';
import { availableLanguageConfigs, getLanguageConfig } from './language';
import { Modules } from './module';
import {
  findPatternInParsedLocations,
  ParseLocationFormat,
  parseLocations,
} from './parseLocations';
import { saveAndPeekSearch } from './savedSearch';
import { Subprocess } from './subprocess';
import { runTask } from './tasks/main';
import { Flag, TaskType } from './tasks/params';
import {
  currentWorkspaceFolder,
  getActiveTextEditor,
  getCursorWordContext,
} from './utils';

const TODO_CATEGORIES = [
  'TODO',
  'XXX',
  'TEMP',
  'FIXME',
  'REFACTOR',
  'OPTIMIZE',
  'DOCS',
  'STUB',
];

export async function executeDefinitionProvider(uri: Uri, position: Position) {
  const locationOrLinks = await commands.executeCommand<
    Array<Location | LocationLink>
  >('vscode.executeDefinitionProvider', uri, position);

  return locationOrLinks.map(locationOrLink);
}

export async function executeReferenceProvider(uri: Uri, position: Position) {
  return commands.executeCommand<Location[]>(
    'vscode.executeReferenceProvider',
    uri,
    position,
  );
}

export async function searchInFiles(
  query: TextSearchQuery,
  options: FindTextInFilesOptions = {},
) {
  const locations: Location[] = [];
  log.debug(`Searching for "${query.pattern}"`);
  await workspace.findTextInFiles(
    query,
    options,
    (result: TextSearchResult) => {
      const match = result as TextSearchMatch;
      const ranges: Range[] =
        match.ranges instanceof Range ? [match.ranges] : match.ranges;
      for (const range of ranges)
        locations.push(new Location(match.uri, range));
    },
  );
  return locations;
}

async function searchTodos() {
  const folder = currentWorkspaceFolder();
  assertNotNull(folder);
  const filterCategories = await selectMultiple(
    TODO_CATEGORIES,
    (label) => ({ label }),
    'todos',
    (label) => label,
  );
  if (!filterCategories) return;
  const patterns = filterCategories.join('|');
  return saveAndPeekSearch(`To-do items ${patterns}`, async () => {
    const subproc = new Subprocess(`patterns='${patterns}' q-git-diff-todo`, {
      cwd: folder.uri.fsPath,
      allowedCodes: [0, 1],
    });
    const res = await subproc.wait();
    if (res.code === 1) {
      return [];
    }
    const parsedLocations = parseLocations(
      res.stdout,
      folder.uri.fsPath,
      ParseLocationFormat.VIMGREP,
    );
    const locsWithRanges = await findPatternInParsedLocations(
      parsedLocations,
      new RegExp(patterns),
    );
    return locsWithRanges;
  });
}

async function searchWordUnderCursor(allFolders: boolean) {
  if (!getCursorWordContext()) {
    throw new CheckError('The cursor is not on word');
  }
  return runTask(
    'search_word',
    {
      type: TaskType.SEARCH,
      // eslint-disable-next-line no-template-curly-in-string
      searchTitle: 'Word "${cursorWord}"',
      // eslint-disable-next-line no-template-curly-in-string
      query: '${cursorWord}',
      flags: [Flag.CASE, Flag.WORD],
    },
    { folder: allFolders ? 'all' : undefined },
  );
}

async function searchSelectedText(allFolders: boolean) {
  if (getActiveTextEditor().selection.isEmpty) {
    throw new CheckError('No text selected');
  }
  return runTask(
    'search_selection',
    {
      type: TaskType.SEARCH,
      // eslint-disable-next-line no-template-curly-in-string
      searchTitle: 'Selected text "${selectedText}"',
      // eslint-disable-next-line no-template-curly-in-string
      query: '${selectedText}',
      flags: [Flag.CASE],
    },
    { folder: allFolders ? 'all' : undefined },
  );
}

async function searchWithCommand(
  type: string,
  searchFunc: (uri: Uri, location: Position) => Promise<Location[]>,
) {
  const ctx = getCursorWordContext();
  checkNotNull(ctx, 'The cursor is not on word');
  return saveAndPeekSearch(`${type} of "${ctx.word}"`, async () =>
    searchFunc(ctx.editor.document.uri, ctx.range.start),
  );
}

namespace TodoCompletion {
  function createItem(label: string, snippet: string) {
    const item = new CompletionItem(label, CompletionItemKind.Snippet);
    item.insertText = new SnippetString(snippet);
    item.sortText = String.fromCharCode(0);
    return item;
  }

  function generateItems(
    languageId: string,
    category: string,
    items: CompletionItem[],
  ) {
    const langCfg = getLanguageConfig(languageId);
    if (!langCfg) return;
    const comment = langCfg.comments;
    if (!comment) return;
    if (comment.lineComment)
      items.push(
        createItem(
          `${comment.lineComment} ${category}:`,
          `${comment.lineComment} ${category}: $0`,
        ),
      );
    if (!comment.blockComment) {
      return;
    }
    const [start, end] = comment.blockComment;
    items.push(
      createItem(
        `${start} ${category}: ${end}`,
        `${start} ${category}: $0 ${end}`,
      ),
    );
  }

  export const provider: CompletionItemProvider = {
    provideCompletionItems(
      document: TextDocument,
      position: Position,
      _: CancellationToken,
      __: CompletionContext,
    ): CompletionItem[] {
      const prefix = getCompletionPrefix(document, position);
      if (prefix === '') return [];
      const items: CompletionItem[] = [];
      const filtered = TODO_CATEGORIES.filter((cat) =>
        abbrevMatch(cat, prefix),
      );
      for (const category of filtered)
        generateItems(document.languageId, category, items);
      return items;
    },
  };
}

async function getCtagsDefinitions(document: TextDocument, word: string) {
  const symbols = await getDocumentSymbolsFromCtags(document);
  return symbols
    .filter((symbol) => symbol.name === word)
    .map((symbol) => new Location(document.uri, symbol.selectionRange));
}

async function getGtagsCtagsDefinitions() {
  const ctx = getCursorWordContext()!;
  const { word } = ctx;
  return saveAndPeekSearch(`ctags/gtags for ${word}`, async () => {
    const [gtagsDefs, ctagsDefs] = await Promise.all([
      getGtagsDefinitionsInWorkspace(),
      getCtagsDefinitions(ctx.editor.document, word),
    ]);
    return gtagsDefs.concat(ctagsDefs);
  });
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerCompletionItemProvider(
      availableLanguageConfigs(),
      TodoCompletion.provider,
    ),
    registerAsyncCommandWrapped('qcfg.search.word', async () =>
      searchWordUnderCursor(false),
    ),
    registerAsyncCommandWrapped('qcfg.search.word.allFolders', async () =>
      searchWordUnderCursor(true),
    ),
    registerAsyncCommandWrapped('qcfg.search.selectedText', async () =>
      searchSelectedText(false),
    ),
    registerAsyncCommandWrapped(
      'qcfg.search.selectedText.allFolders',
      async () => searchSelectedText(true),
    ),
    registerAsyncCommandWrapped('qcfg.search.definitions', async () =>
      searchWithCommand('Definitions', executeDefinitionProvider),
    ),
    registerAsyncCommandWrapped('qcfg.search.references', async () =>
      searchWithCommand('References', executeReferenceProvider),
    ),
    registerAsyncCommandWrapped('qcfg.search.todos', searchTodos),
    registerAsyncCommandWrapped(
      'qcfg.search.GtagsCtagsDefinition',
      getGtagsCtagsDefinitions,
    ),
  );
}

Modules.register(activate);
