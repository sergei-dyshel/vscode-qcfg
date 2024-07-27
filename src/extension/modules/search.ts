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
} from "vscode";
import {
  commands,
  CompletionItem,
  CompletionItemKind,
  languages,
  Location,
  Range,
  SnippetString,
  workspace,
} from "vscode";
import { assertNotNull, checkNotNull } from "../../library/exception";
import { log } from "../../library/logging";
import { abbrevMatch } from "../../library/stringUtils";
import { getConfiguration } from "../utils/configuration";
import { resolveLocationLinks } from "../utils/document";
import { PersistentStringQuickPick } from "../utils/quickPickPersistent";
import { getCompletionPrefix } from "./documentUtils";
import { registerAsyncCommandWrapped } from "./exception";
import { updateHistory } from "./history";
import { availableLanguageConfigs, getLanguageConfig } from "./language";
import { Modules } from "./module";
import {
  findPatternInParsedLocations,
  ParseLocationFormat,
  parseLocations,
} from "./parseLocations";
import { saveAndPeekSearch } from "./savedSearch";
import { Subprocess } from "./subprocess";
import { currentWorkspaceFolder, getCursorWordContext } from "./utils";

export async function executeDefinitionProvider(uri: Uri, position: Position) {
  const locationOrLinks = await commands.executeCommand<
    Array<Location | LocationLink>
  >("vscode.executeDefinitionProvider", uri, position);

  return resolveLocationLinks(locationOrLinks);
}

export async function executeReferenceProvider(uri: Uri, position: Position) {
  return commands.executeCommand<Location[]>(
    "vscode.executeReferenceProvider",
    uri,
    position,
  );
}

export async function executeImplementationProvider(
  uri: Uri,
  position: Position,
) {
  return resolveLocationLinks(
    await commands.executeCommand<Array<Location | LocationLink>>(
      "vscode.executeImplementationProvider",
      uri,
      position,
    ),
  );
}

export async function executeDeclarationProvider(uri: Uri, position: Position) {
  return resolveLocationLinks(
    await commands.executeCommand<Array<Location | LocationLink>>(
      "vscode.executeDeclarationProvider",
      uri,
      position,
    ),
  );
}

/**
 * Find references which are not defintion/declaration/implementation
 */
export async function findProperReferences(
  uri: Uri,
  position: Position,
): Promise<Location[]> {
  const [refs, defs, decls, impls] = await Promise.all([
    executeReferenceProvider(uri, position),
    executeDefinitionProvider(uri, position),
    executeDeclarationProvider(uri, position),
    executeImplementationProvider(uri, position),
  ]);
  const removeRefs = [...defs, ...decls, ...impls];
  return refs.filter(
    (loc) => undefined === removeRefs.firstOf((loc1) => loc.equals(loc1)),
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
  const qp = new PersistentStringQuickPick(
    "todos",
    getConfiguration().get("qcfg.todo.keywords", []),
  );
  qp.options.canSelectMany = true;
  const filterCategories = await qp.selectMany();
  if (!filterCategories) return;
  const patterns = filterCategories.join("|");
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

export async function searchWithCommand(
  type: string,
  searchFunc: (uri: Uri, location: Position) => Promise<Location[]>,
) {
  const ctx = getCursorWordContext();
  checkNotNull(ctx, "The cursor is not on word");
  return saveAndPeekSearch(
    `${type} of "${ctx.word}"`,
    async () => searchFunc(ctx.editor.document.uri, ctx.range.start),
    ctx.location,
  );
}

namespace TodoCompletion {
  function createItem(label: string, snippet: string) {
    const item = new CompletionItem(label, CompletionItemKind.Snippet);
    item.insertText = new SnippetString(snippet);
    item.sortText = String.fromCodePoint(0);
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
    if (comment.lineComment) {
      items.push(
        createItem(
          `${comment.lineComment} ${category}:`,
          `${comment.lineComment} ${category}: $0`,
        ),
      );
      return;
    }
    if (comment.blockComment) {
      const [start, end] = comment.blockComment;
      items.push(
        createItem(
          `${start} ${category}: ${end}`,
          `${start} ${category}: $0 ${end}`,
        ),
      );
    }
  }

  export const provider: CompletionItemProvider = {
    provideCompletionItems(
      document: TextDocument,
      position: Position,
      _: CancellationToken,
      __: CompletionContext,
    ): CompletionItem[] {
      const prefix = getCompletionPrefix(document, position);
      if (prefix === "") return [];
      const items: CompletionItem[] = [];
      const filtered = getConfiguration()
        .get("qcfg.todo.keywords", [])
        .filter((cat) => abbrevMatch(cat, prefix));
      for (const category of filtered)
        generateItems(document.languageId, category, items);
      return items;
    },
  };
}

async function peekTypeHierarchy() {
  await commands.executeCommand("editor.showTypeHierarchy");
  await commands.executeCommand("editor.showSubtypes");
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerCompletionItemProvider(
      availableLanguageConfigs(),
      TodoCompletion.provider,
    ),
    registerAsyncCommandWrapped("qcfg.search.definitions", async () =>
      searchWithCommand("Definitions", executeDefinitionProvider),
    ),
    registerAsyncCommandWrapped("qcfg.search.references", async () =>
      searchWithCommand("References", executeReferenceProvider),
    ),
    registerAsyncCommandWrapped("qcfg.search.properReferences", async () =>
      searchWithCommand("Proper references", findProperReferences),
    ),
    registerAsyncCommandWrapped("qcfg.search.implementations", async () =>
      searchWithCommand("Implementations", executeImplementationProvider),
    ),
    registerAsyncCommandWrapped("qcfg.search.declarations", async () =>
      searchWithCommand("Declarations", executeDeclarationProvider),
    ),
    registerAsyncCommandWrapped("qcfg.showTypeHierarchy", async () =>
      updateHistory(peekTypeHierarchy()),
    ),
    registerAsyncCommandWrapped("qcfg.showCallHierarchy", async () =>
      updateHistory(commands.executeCommand("editor.showCallHierarchy")),
    ),
    registerAsyncCommandWrapped("qcfg.search.todos", searchTodos),
  );
}

Modules.register(activate);
