'use strict';

import * as vscode from 'vscode';
import {Range, TextSearchQuery, Location} from 'vscode';
import {Logger} from './logging';
import {getCursorWordContext, currentWorkspaceFolder, registerCommand} from './utils';
import { ParsedLocation, setLocations, parseLocations } from './locationTree';
import { Subprocess } from './subprocess';

const log = Logger.create('search');

async function searchInFiles(query: TextSearchQuery) {
  const locations: ParsedLocation[] = [];
  await vscode.workspace.findTextInFiles(
      query, (match: vscode.TextSearchMatch) => {
        const ranges: Range[] = match.ranges instanceof Range ?
            [match.ranges] :
            match.ranges as Range[];
        for (const range of ranges)
          locations.push({
            location: new vscode.Location(match.uri, range),
            text: match.preview.text.trim()
          });
      });
  return locations;
}

async function searchTodos() {
  const folder = log.assertNonNull(currentWorkspaceFolder());
  const subproc = new Subprocess(
      'patterns=\'TODO|TEMP|XXX|FIXME\' git-diff-todo.sh',
      {cwd: folder.uri.fsPath});
  const res = await subproc.wait();
  setLocations(
      'TODO|TEMP|XXX|FIXME', parseLocations(res.stdout, folder.uri.fsPath));
}

// TODO: move to utils
function editorCurrentLocation(editor: vscode.TextEditor) {
  return new Location(editor.document.uri, editor.selection);
}

// TODO: move to utils
function peekLocations(current: Location, locations: Location[]) {
  return vscode.commands.executeCommand(
      'editor.action.showReferences', current.uri, current.range, locations);
}

async function searchWord(panel: boolean)
{
  const {editor, word} = log.assertNonNull(getCursorWordContext());
  const query: TextSearchQuery = {pattern: word, isWordMatch: true};
  const parsedLocations = await searchInFiles(query);
  if (panel)
    setLocations(`Word "${word}"`, parsedLocations, true /* reveal */);
  else
    peekLocations(
        editorCurrentLocation(editor),
        parsedLocations.map(parsedLoc => parsedLoc.location));
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

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      registerCommand(
          'qcfg.search.word.peek', () => searchWord(false /* peek */)),
      registerCommand(
          'qcfg.search.word.panel', () => searchWord(true /* panel */)),
      registerCommand('qcfg.search.todos', searchTodos),
      registerCommand('qcfg.search.structField', searchStructField));
}