'use strict';

import * as vscode from 'vscode';
import {Range, TextSearchQuery} from 'vscode';
import {commands} from 'vscode';
import {Logger} from './logging';
import {getCursorWordContext} from './utils';

const log = Logger.create('search');

async function searchInFiles(query: TextSearchQuery):
    Promise<vscode.Location[]> {
  const locations: vscode.Location[] = [];
  await vscode.workspace.findTextInFiles(
      query, (match: vscode.TextSearchMatch) => {
        const ranges: Range[] = match.ranges instanceof Range ?
            [match.ranges] :
            match.ranges as Range[];
        for (const range of ranges)
          locations.push(new vscode.Location(match.uri, range));
      });
  return locations;
}

async function searchWord()
{
  const {editor, word} = log.assertNonNull(getCursorWordContext());
  const query: TextSearchQuery = {pattern: word, isWordMatch: true};
  const locations = await searchInFiles(query);
  vscode.commands.executeCommand(
      'editor.action.showReferences', editor.document.uri,
      editor.selection.active, locations);
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
    commands.registerCommand('qcfg.search.word', searchWord),
    commands.registerCommand('qcfg.search.structField', searchStructField)
  );
}