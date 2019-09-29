'use strict';

import {TextEditor, window, commands, TextEditorEdit, Selection, ViewColumn, TextEditorRevealType, ExtensionContext, workspace, ConfigurationTarget } from 'vscode';
import {Position} from 'vscode';
import * as clipboardy from 'clipboardy';

import {offsetPosition, isLinewise, expandLinewise, trimWhitespace, selectRange, trimBrackets} from './textUtils';
import { log } from './logging';
import {getActiveTextEditor, getCursorWordContext} from './utils';

import { forceNonTemporary, resetTemporary } from './history';
import { registerCommandWrapped, registerTextEditorCommandWrapped } from './exception';
import { Modules } from './module';
import { lineIndentation } from './documentUtils';

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
  const editsDone = await editor.edit((edit: TextEditorEdit) => {
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
  editor.selection = new Selection(pos, pos);
  console.log('Selection:', editor.selection);
}

function swapCursorAndAnchor(
    editor: TextEditor) {
  editor.selections = editor.selections.map((sel) => {
    return new Selection(sel.active, sel.anchor);
  });
}

function cloneEditorBeside(): void {
  log.assert(window.activeTextEditor);
  const editor = window.activeTextEditor as TextEditor;
  const columns = new Set<ViewColumn>();
  for (const editor of window.visibleTextEditors)
    if (editor.viewColumn)
      columns.add(editor.viewColumn);

  if (columns.size === 1) {
    commands.executeCommand('workbench.action.splitEditor');
    return;
  }
  let newColumn: ViewColumn;
  switch (editor.viewColumn) {
    case ViewColumn.One:
      newColumn = ViewColumn.Two;
      break;
    case ViewColumn.Two:
      newColumn = ViewColumn.One;
      break;
    default:
      return;
  }
  // console.log(`Active editor ${editor.viewColumn}, new column ${newColumn}`);
  const visible = editor.visibleRanges[0];
  const pos = editor.selection.active;
  const doc = editor.document;
  window.showTextDocument(doc, newColumn).then((newEditor) => {
    newEditor.selection = new Selection(pos, pos);
    newEditor.revealRange(visible, TextEditorRevealType.InCenter);
  });
}

type DirectionArg = 'up' | 'down' | 'left' | 'right';

async function syncEditorToDirection(args: any[]) {
  const dir: DirectionArg = args[0];
  log.assert(window.activeTextEditor);
  const editor = window.activeTextEditor as TextEditor;
  const visible = editor.visibleRanges[0];
  const pos = editor.selection.active;
  const doc = editor.document;
  const column = editor.viewColumn;
  const focusCmd = {
    up: 'workbench.action.focusAboveGroup',
    down: 'workbench.action.focusBelowGroup',
    left: 'workbench.action.focusLeftGroup',
    right: 'workbench.action.focusRightGroup'
  };
  const splitCmd = {
    down: 'workbench.action.splitEditorDown',
    left: 'workbench.action.splitEditorLeft',
    right: 'workbench.action.splitEditorRight',
    up: 'workbench.action.splitEditorUp'
  };
  await commands.executeCommand(focusCmd[dir]);
  const adjEditor = window.activeTextEditor!;
  if (adjEditor.viewColumn === column) {
    await commands.executeCommand(splitCmd[dir]);
    return;
  }
  // console.log(`Active editor ${editor.viewColumn}, new column ${newColumn}`);
  window.showTextDocument(doc, adjEditor).then((newEditor) => {
    newEditor.selection = new Selection(pos, pos);
    newEditor.revealRange(visible, TextEditorRevealType.InCenter);
  });
}

function smartPaste(
    editor: TextEditor, edit: TextEditorEdit) {
  const text = clipboardy.readSync();
  if (!text.endsWith('\n') || editor.selections.length > 1) {
    commands.executeCommand('editor.action.clipboardPasteAction');
    return;
  }
  const selection = editor.selection;
  if (selection.isEmpty) {
    const cursor = selection.active;
    const lineStart = new Position(cursor.line, 0);
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
  let selection: Selection | undefined;
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

function gotoLineRelative(delta: number) {
  const editor = getActiveTextEditor();
  const active = editor.selection.active;
  const pos = new Position(active.line + delta, active.character);
  editor.selection = new Selection(pos, pos);
}

async function wrapWithBracketsInline(args: string[]) {
  const editor = getActiveTextEditor();
  const selection = editor.selection;
  const document = editor.document;
  const prevLine = selection.start.line - 1;
  const nextLine = selection.end.line + 1;
  if (prevLine < 0 || nextLine > document.lineCount - 1)
    throw new Error('Can not wrap first or last line');
  await editor.edit(builder => {
    const start = document.lineAt(prevLine).range.end;
    const indentation = lineIndentation(document, prevLine);
    builder.insert(start, ' ' + args[0]);
    const end = new Position(nextLine, 0);
    builder.insert(end, indentation + args[1] + '\n');
  });
}

async function stripBrackets() {
  const editor = getActiveTextEditor();
  const selection = editor.selection;
  const strippedRange = trimBrackets(editor.document, selection);
  if (strippedRange.isEqual(selection))
    return;
  const strippedText = editor.document.getText(strippedRange);
  const start = selection.start;
  const reversed = selection.isReversed;
  await editor.edit(builder => {
    builder.replace(selection, strippedText);
  });
  const end = offsetPosition(editor.document, start, strippedText.length);
  editor.selection =
      reversed ? new Selection(end, start) : new Selection(start, end);
}

function selectWordUnderCursor() {
  const word = getCursorWordContext();
  if (!word)
    throw Error('No word under cursor');
  word.editor.selection = word.range.asSelection();
}

type LineNumberConf = 'on' | 'off' | 'interval' | 'relative';

function toggleRelativeNumbers() {
  const SECTION = 'editor.lineNumbers';
  const conf = workspace.getConfiguration();
  const info = conf.inspect<string>(SECTION)!;
  if (info.workspaceFolderValue || info.workspaceValue)
    throw Error(`"${SECTION}" is overriden on workspace/folder level`);
  const value = (info.globalValue || info.defaultValue) as LineNumberConf;
  switch (value) {
  case 'on':
    conf.update(SECTION, 'relative', ConfigurationTarget.Global);
    break;
  case 'relative':
    conf.update(SECTION, 'on', ConfigurationTarget.Global);
    break;
  default:
    throw Error(`"${SECTION} has value of '${value}`);
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
      registerCommandWrapped('qcfg.gotoLineRelative', gotoLineRelative),
      registerCommandWrapped('qcfg.selectLines', selectLines),
      registerCommandWrapped('qcfg.goToDefinition', goToDefinition),
      registerCommandWrapped('qcfg.peekReferences', peekReferences),
      registerTextEditorCommandWrapped(
          'qcfg.swapCursorAndAnchor', swapCursorAndAnchor),
      registerTextEditorCommandWrapped('qcfg.smartPaste', smartPaste),
      registerCommandWrapped('qcfg.surroundWith', surroundWith),
      registerCommandWrapped('qcfg.cloneEditorBeside', cloneEditorBeside),
      registerCommandWrapped(
          'qcfg.syncEditorToDirection', syncEditorToDirection),
      registerCommandWrapped(
          'qcfg.wrapWithBracketsInline', wrapWithBracketsInline),
      registerCommandWrapped('qcfg.stripBrackets', stripBrackets),
      registerCommandWrapped(
          'qcfg.navigateBackToPreviousFile', navigateBackToPreviousFile),
      registerCommandWrapped(
          'qcfg.selectWordUnderCursor', selectWordUnderCursor),
      registerCommandWrapped(
          'qcfg.toggleRelativeLineNumbers', toggleRelativeNumbers));
}

Modules.register(activate);