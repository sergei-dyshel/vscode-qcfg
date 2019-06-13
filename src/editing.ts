'use strict';

import {TextEditor, window, commands} from 'vscode';
import * as vscode from 'vscode';
import {Position} from 'vscode';
import * as clipboardy from 'clipboardy';

import {offsetPosition, isLinewise, expandLinewise, trimWhitespace, selectRange} from './textUtils';
import { log } from './logging';
import {getActiveTextEditor} from './utils';

import { forceNonTemporary, resetTemporary } from './history';
import { registerCommandWrapped, registerTextEditorCommandWrapped } from './exception';
import { Modules } from './module';

function selectLines() {
  const editor = getActiveTextEditor();
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
  const editor = getActiveTextEditor();
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
    editor: TextEditor) {
  editor.selections = editor.selections.map((sel) => {
    return new vscode.Selection(sel.active, sel.anchor);
  });
}

function cloneEditorBeside(): void {
  log.assert(window.activeTextEditor);
  const editor = window.activeTextEditor as TextEditor;
  const columns = new Set<vscode.ViewColumn>();
  for (const editor of window.visibleTextEditors)
    if (editor.viewColumn)
      columns.add(editor.viewColumn);

  if (columns.size === 1) {
    commands.executeCommand('workbench.action.splitEditor');
    return;
  }
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
  window.showTextDocument(doc, newColumn).then((newEditor) => {
    newEditor.selection = new vscode.Selection(pos, pos);
    newEditor.revealRange(visible, vscode.TextEditorRevealType.InCenter);
  });
}

function smartPaste(
    editor: TextEditor, edit: vscode.TextEditorEdit) {
  const text = clipboardy.readSync();
  if (!text.endsWith('\n') || editor.selections.length > 1) {
    commands.executeCommand('editor.action.clipboardPasteAction');
    return;
  }
  const selection = editor.selection;
  if (selection.isEmpty) {
    const cursor = selection.active;
    const lineStart = new vscode.Position(cursor.line, 0);
    edit.replace(lineStart, text);
  } else if (selection.end.character === 0) {
    commands.executeCommand('editor.action.clipboardPasteAction');
  } else {
    selectLines();
    commands.executeCommand('editor.action.clipboardPasteAction');
  }
}

async function navigateBackToPreviousFile() {
  const firstEditor = window.activeTextEditor;
  if (!firstEditor)
    return;
  let editor = firstEditor;
  let selection: vscode.Selection | undefined;
  while ((editor.document === firstEditor.document) &&
         (editor.selection !== selection)) {
    selection = editor.selection;
    await commands.executeCommand('workbench.action.navigateBack');
    if (!window.activeTextEditor)
          return;
    editor = window.activeTextEditor;
  }
}

async function goToDefinition() {
  forceNonTemporary();
  await commands.executeCommand('editor.action.goToDeclaration');
  resetTemporary();
}

async function peekReferences() {
  forceNonTemporary();
  await commands.executeCommand('editor.action.referenceSearch.trigger');
  resetTemporary();
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      registerCommandWrapped('qcfg.selectLines', selectLines),
      registerCommandWrapped('qcfg.goToDefinition', goToDefinition),
      registerCommandWrapped('qcfg.peekReferences', peekReferences),
      registerTextEditorCommandWrapped(
          'qcfg.swapCursorAndAnchor', swapCursorAndAnchor),
      registerTextEditorCommandWrapped('qcfg.smartPaste', smartPaste),
      registerCommandWrapped('qcfg.surroundWith', surroundWith),
      registerCommandWrapped('qcfg.cloneEditorBeside', cloneEditorBeside),
      registerCommandWrapped(
          'qcfg.navigateBackToPreviousFile', navigateBackToPreviousFile));
}

Modules.register(activate);