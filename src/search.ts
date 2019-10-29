'use strict';

import * as vscode from 'vscode';
import { CompletionItem, Location, Range, TextSearchQuery } from 'vscode';
import { selectMultiple } from './dialog';
import { getCompletionPrefix } from './documentUtils';
import { availableLanguageConfigs, getLanguageConfig } from './language';
import { setLocations } from './locationTree';
import { log } from './logging';
import { abbrevMatch } from './stringUtils';
import { Subprocess } from './subprocess';
import {currentWorkspaceFolder, getCursorWordContext} from './utils';
import { registerCommandWrapped } from './exception';
import { Modules } from './module';
import { ParsedLocation, parseLocations, ParseLocationFormat } from './parseLocations';

const TODO_CATEGORIES =
    ['TODO', 'XXX', 'TEMP', 'FIXME', 'REFACTOR', 'OPTIMIZE', 'DOCS', 'STUB'];

export async function searchInFiles(
    query: TextSearchQuery, options: vscode.FindTextInFilesOptions = {}) {
  const locations: ParsedLocation[] = [];
  log.debug(`Searching for "${query.pattern}"`);
  await vscode.workspace.findTextInFiles(
      query, options, (result: vscode.TextSearchResult) => {
        const match = result as vscode.TextSearchMatch;
        const ranges: Range[] = match.ranges instanceof Range ?
            [match.ranges] :
            match.ranges as Range[];
        for (const range of ranges)
          locations.push(
              new ParsedLocation(match.uri, range, match.preview.text),
          );
      });
  return locations;
}

async function searchTodos() {
  const folder = log.assertNonNull(currentWorkspaceFolder());
  const filterCategories = await selectMultiple(
      TODO_CATEGORIES, label => ({label}), 'todos', label => label);
  if (!filterCategories)
    return;
  const patterns = filterCategories.join('|');
  const subproc = new Subprocess(
      `patterns=\'${patterns}\' q-git-diff-todo`,
      {cwd: folder.uri.fsPath, allowedCodes: [0, 1]});
  const res = await subproc.wait();
  if (res.code === 1) {
    vscode.window.showWarningMessage(`No ${patterns} items were found`);
  } else {
    setLocations(
        patterns,
        parseLocations(
            res.stdout, folder.uri.fsPath, ParseLocationFormat.VIMGREP));
  }
}

// TODO: move to utils
function editorCurrentLocation(editor: vscode.TextEditor) {
  return new Location(editor.document.uri, editor.selection);
}

// TODO: move to utils
function peekLocations(current: Location, locations: Location[]) {
  return vscode.commands.executeCommand(
      'editor.action.showReferences', current.uri, current.range.start,
      locations);
}

async function searchWord(panel: boolean)
{
  const {editor, word} = log.assertNonNull(getCursorWordContext());
  const query: TextSearchQuery = {pattern: word, isWordMatch: true};
  const parsedLocations = await searchInFiles(query);
  if (panel)
    setLocations(`Word "${word}"`, parsedLocations, true /* reveal */);
  else
    await peekLocations(editorCurrentLocation(editor), parsedLocations);
}

async function searchStructField()
{
  const {editor, word} = log.assertNonNull(getCursorWordContext());
  const query: TextSearchQuery = {
    pattern: '(->|\\.)' + word,
    isWordMatch: true,
    isRegExp: true
  };
  const locations = await searchInFiles(query);
  vscode.commands.executeCommand(
      'editor.action.showReferences', editor.document.uri,
      editor.selection.active, locations);
}

namespace TodoCompletion {
  function createItem(label: string, snippet: string) {
    const item =
        new vscode.CompletionItem(label, vscode.CompletionItemKind.Snippet);
    item.insertText = new vscode.SnippetString(snippet);
    item.sortText = String.fromCharCode(0);
    return item;
  }

  function generateItems(
      languageId: string, category: string, items: CompletionItem[]) {
    const langCfg = getLanguageConfig(languageId);
    if (!langCfg)
      return;
    const comment = langCfg.comments;
    if (!comment)
      return;
    if (comment.lineComment)
      items.push(createItem(
          `${comment.lineComment} ${category}:`,
          `${comment.lineComment} ${category}: $0`));
    if (comment.blockComment) {
      const [start, end] = comment.blockComment;
      items.push(createItem(
          `${start} ${category}: ${end}`, `${start} ${category}: $0 ${end}`));
    }
  }

  export const provider: vscode.CompletionItemProvider = {
    provideCompletionItems(
        document: vscode.TextDocument, position: vscode.Position,
        _: vscode.CancellationToken,
        __: vscode.CompletionContext): CompletionItem[] {
      const prefix = getCompletionPrefix(document, position);
      if (prefix === '')
          return [];
      const items: CompletionItem[] = [];
      const filtered = TODO_CATEGORIES.filter(cat => (abbrevMatch(cat, prefix)));
      for (const category of filtered)
        generateItems(document.languageId, category, items);
      return items;
    }
  };
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.languages.registerCompletionItemProvider(
          availableLanguageConfigs(), TodoCompletion.provider),
      registerCommandWrapped(
          'qcfg.search.word.peek', () => searchWord(false /* peek */)),
      registerCommandWrapped(
          'qcfg.search.word.panel', () => searchWord(true /* panel */)),
      registerCommandWrapped('qcfg.search.todos', searchTodos),
      registerCommandWrapped('qcfg.search.structField', searchStructField));
}

Modules.register(activate);
