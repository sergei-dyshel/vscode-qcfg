'use strict';

import * as vscode from 'vscode';
import {Position} from 'vscode';
import * as clipboardy from 'clipboardy';

import {offsetPosition, isLinewise, expandLinewise, trimWhitespace, selectRange} from './textUtils';
import {Range} from 'vscode-languageclient';

function selectLines(...args: any[]) {
  const editor = vscode.window.activeTextEditor;
  if (editor.selections.length > 1)
    return;

    const selection = editor.selection;
  const document = editor.document;

  if (editor.selections.length > 1)
    return;
  if (isLinewise(selection))
    selectRange(editor, trimWhitespace(document, selection));
  else
    selectRange(editor, expandLinewise(selection));
}

async function surroundWith(args: any[]) {
  const editor = vscode.window.activeTextEditor;
  const selection = editor.selection;
  if (selection.isEmpty)
    return;
  const [prefix, suffix, direction] = args;
  const text = editor.document.getText(selection);
  const replaceText = prefix + text + suffix;
  const selectionStart = selection.start;
  const editsDone = await editor.edit((edit: vscode.TextEditorEdit) => {
    edit.replace(selection, replaceText);
  });
  if (!editsDone)
    throw new Error("[surroundWith] Could not apply edit");
  let pos: Position;
  if (direction === 'left')
      pos = selectionStart;
  else if (direction === 'right')
    pos = offsetPosition(editor.document, selectionStart, replaceText.length);
  else
    throw new Error(`surroundWith: Invalid direction "${direction}"`);
  editor.selection = new vscode.Selection(pos, pos);
  console.log('Selection:', editor.selection);
}

function swapCursorAndAnchor(
    editor: vscode.TextEditor, edit: vscode.TextEditorEdit, args: any[]) {
  if (editor.selections.length > 1)
    return;
  const cursor = editor.selection.active;
  const anchor = editor.selection.anchor;
  if (cursor.isEqual(anchor))
    return;

  editor.selection = new vscode.Selection(cursor, anchor);
}

function cloneEditorBeside(...args: any[]): void {
  const columns = new Set<vscode.ViewColumn>();
  for (const editor of vscode.window.visibleTextEditors)
    if (editor.viewColumn)
      columns.add(editor.viewColumn);

  if (columns.size === 1) {
    vscode.commands.executeCommand('workbench.action.splitEditor');
    return;
  }
  const editor = vscode.window.activeTextEditor;
  let newColumn: vscode.ViewColumn;
  switch (editor.viewColumn) {
    case vscode.ViewColumn.One:
      newColumn = vscode.ViewColumn.Two;
      break;
    case vscode.ViewColumn.Two:
      newColumn = vscode.ViewColumn.One;
      break;
    default:
      return;
  }
  // console.log(`Active editor ${editor.viewColumn}, new column ${newColumn}`);
  const visible = editor.visibleRanges[0];
  const pos = editor.selection.active;
  const doc = editor.document;
  vscode.window.showTextDocument(doc, newColumn).then((newEditor) => {
    newEditor.selection = new vscode.Selection(pos, pos);
    newEditor.revealRange(visible, vscode.TextEditorRevealType.InCenter);
  });
}

function smartPaste(
    editor: vscode.TextEditor, edit: vscode.TextEditorEdit, args?: any[]) {
  const text = clipboardy.readSync();
  if (!text.endsWith('\n') || editor.selections.length > 1) {
    vscode.commands.executeCommand('editor.action.clipboardPasteAction');
    return;
  }
  const selection = editor.selection;
  if (selection.isEmpty) {
    const cursor = selection.active;
    const lineStart = new vscode.Position(cursor.line, 0);
    edit.replace(lineStart, text);
  } else if (selection.end.character === 0) {
    vscode.commands.executeCommand('editor.action.clipboardPasteAction');
  } else {
    selectLines();
    vscode.commands.executeCommand('editor.action.clipboardPasteAction');
  }
}

async function navigateBackToPreviousFile() {
  const firstEditor = vscode.window.activeTextEditor;
  if (!firstEditor)
    return;
  let editor = firstEditor;
  let selection: vscode.Selection;
  while ((editor.document === firstEditor.document) &&
         (editor.selection !== selection)) {
    selection = editor.selection;
    await vscode.commands.executeCommand('workbench.action.navigateBack');
    editor = vscode.window.activeTextEditor;
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.commands.registerCommand('qcfg.selectLines', selectLines));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand(
      'qcfg.swapCursorAndAnchor', swapCursorAndAnchor));
  context.subscriptions.push(vscode.commands.registerTextEditorCommand(
      'qcfg.smartPaste', smartPaste));
  context.subscriptions.push(vscode.commands.registerCommand(
      'qcfg.surroundWith', surroundWith));
  context.subscriptions.push(vscode.commands.registerCommand(
      'qcfg.cloneEditorBeside', cloneEditorBeside));
  context.subscriptions.push(vscode.commands.registerCommand(
      'qcfg.navigateBackToPreviousFile', navigateBackToPreviousFile));
}