'use strict';

import {
  TextEditor,
  window,
  commands,
  TextEditorEdit,
  Selection,
  ViewColumn,
  TextEditorRevealType,
  ExtensionContext,
  workspace,
  ConfigurationTarget,
  Position,
} from 'vscode';
import * as clipboardy from 'clipboardy';

import {
  offsetPosition,
  isLinewise,
  expandLinewise,
  trimWhitespace,
  selectRange,
  trimBrackets,
} from './textUtils';
import { log } from './logging';
import { getActiveTextEditor, getCursorWordContext } from './utils';

import { forceNonTemporary, resetTemporary } from './history';
import {
  registerAsyncCommandWrapped,
  registerTextEditorCommandWrapped,
  executeCommandHandled,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import { lineIndentation } from './documentUtils';

function selectLines() {
  const editor = getActiveTextEditor();
  if (editor.selections.length > 1) return;

  const selection = editor.selection;
  const document = editor.document;

  if (editor.selections.length > 1) return;
  if (isLinewise(selection))
    selectRange(editor, trimWhitespace(document, selection));
  else selectRange(editor, expandLinewise(selection));
}

async function surroundWith(args: unknown[]) {
  const editor = getActiveTextEditor();
  const selection = editor.selection;
  if (selection.isEmpty) return;
  const [prefix, suffix, direction] = args;
  const text = editor.document.getText(selection);
  const replaceText = prefix + text + suffix;
  const selectionStart = selection.start;
  const editsDone = await editor.edit((edit: TextEditorEdit) => {
    edit.replace(selection, replaceText);
  });
  if (!editsDone) throw new Error('[surroundWith] Could not apply edit');
  let pos: Position;
  if (direction === 'left') pos = selectionStart;
  else if (direction === 'right')
    pos = offsetPosition(editor.document, selectionStart, replaceText.length);
  else throw new Error(`surroundWith: Invalid direction "${direction}"`);
  editor.selection = new Selection(pos, pos);
  console.log('Selection:', editor.selection);
}

function swapCursorAndAnchor(editor: TextEditor) {
  editor.selections = editor.selections.map(
    sel => new Selection(sel.active, sel.anchor),
  );
}

async function cloneEditorBeside() {
  log.assert(window.activeTextEditor);
  const editor = window.activeTextEditor as TextEditor;
  const columns = new Set<ViewColumn>();
  for (const visEditor of window.visibleTextEditors)
    if (visEditor.viewColumn) columns.add(visEditor.viewColumn);

  if (columns.size === 1) {
    executeCommandHandled('workbench.action.splitEditor');
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
  const newEditor = await window.showTextDocument(doc, newColumn);
  newEditor.selection = new Selection(pos, pos);
  newEditor.revealRange(visible, TextEditorRevealType.InCenter);
}

type DirectionArg = 'up' | 'down' | 'left' | 'right';

async function syncEditorToDirection(args: unknown[]) {
  const dir = args[0] as DirectionArg;
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
    right: 'workbench.action.focusRightGroup',
  };
  const splitCmd = {
    down: 'workbench.action.splitEditorDown',
    left: 'workbench.action.splitEditorLeft',
    right: 'workbench.action.splitEditorRight',
    up: 'workbench.action.splitEditorUp',
  };
  await commands.executeCommand(focusCmd[dir]);
  const adjEditor = window.activeTextEditor!;
  if (adjEditor.viewColumn === column) {
    await commands.executeCommand(splitCmd[dir]);
    return;
  }
  // console.log(`Active editor ${editor.viewColumn}, new column ${newColumn}`);
  const newEditor = await window.showTextDocument(doc, adjEditor);
  newEditor.selection = new Selection(pos, pos);
  newEditor.revealRange(visible, TextEditorRevealType.InCenter);
}

async function smartPaste(editor: TextEditor, edit: TextEditorEdit) {
  const text = clipboardy.readSync();
  if (!text.endsWith('\n') || editor.selections.length > 1) {
    await commands.executeCommand('editor.action.clipboardPasteAction');
    return;
  }
  const selection = editor.selection;
  if (selection.isEmpty) {
    const cursor = selection.active;
    const lineStart = new Position(cursor.line, 0);
    edit.replace(lineStart, text);
  } else if (selection.end.character === 0) {
    await commands.executeCommand('editor.action.clipboardPasteAction');
  } else {
    selectLines();
    await commands.executeCommand('editor.action.clipboardPasteAction');
  }
}

async function navigateBackToPreviousFile() {
  const firstEditor = window.activeTextEditor;
  if (!firstEditor) return;
  let editor = firstEditor;
  let selection: Selection | undefined;
  while (
    editor.document === firstEditor.document &&
    editor.selection !== selection
  ) {
    selection = editor.selection;
    await commands.executeCommand('workbench.action.navigateBack');
    if (!window.activeTextEditor) return;
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
  if (strippedRange.isEqual(selection)) return;
  const strippedText = editor.document.getText(strippedRange);
  const start = selection.start;
  const reversed = selection.isReversed;
  await editor.edit(builder => {
    builder.replace(selection, strippedText);
  });
  const end = offsetPosition(editor.document, start, strippedText.length);
  editor.selection = reversed
    ? new Selection(end, start)
    : new Selection(start, end);
}

function selectWordUnderCursor() {
  const word = getCursorWordContext();
  if (!word) throw Error('No word under cursor');
  word.editor.selection = word.range.asSelection();
}

type LineNumberConf = 'on' | 'off' | 'interval' | 'relative';

async function toggleRelativeNumbers() {
  const SECTION = 'editor.lineNumbers';
  const conf = workspace.getConfiguration();
  const info = conf.inspect<string>(SECTION)!;
  if (info.workspaceFolderValue || info.workspaceValue)
    throw Error(`"${SECTION}" is overriden on workspace/folder level`);
  const value = (info.globalValue || info.defaultValue) as LineNumberConf;
  switch (value) {
    case 'on':
      await conf.update(SECTION, 'relative', ConfigurationTarget.Global);
      break;
    case 'relative':
      await conf.update(SECTION, 'on', ConfigurationTarget.Global);
      break;
    default:
      throw Error(`"${SECTION} has value of '${value}`);
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerSyncCommandWrapped('qcfg.gotoLineRelative', gotoLineRelative),
    registerSyncCommandWrapped('qcfg.selectLines', selectLines),
    registerAsyncCommandWrapped('qcfg.goToDefinition', goToDefinition),
    registerAsyncCommandWrapped('qcfg.peekReferences', peekReferences),
    registerTextEditorCommandWrapped(
      'qcfg.swapCursorAndAnchor',
      swapCursorAndAnchor,
    ),
    registerTextEditorCommandWrapped('qcfg.smartPaste', smartPaste),
    registerAsyncCommandWrapped('qcfg.surroundWith', surroundWith),
    registerAsyncCommandWrapped('qcfg.cloneEditorBeside', cloneEditorBeside),
    registerAsyncCommandWrapped(
      'qcfg.syncEditorToDirection',
      syncEditorToDirection,
    ),
    registerAsyncCommandWrapped(
      'qcfg.wrapWithBracketsInline',
      wrapWithBracketsInline,
    ),
    registerAsyncCommandWrapped('qcfg.stripBrackets', stripBrackets),
    registerAsyncCommandWrapped(
      'qcfg.navigateBackToPreviousFile',
      navigateBackToPreviousFile,
    ),
    registerSyncCommandWrapped(
      'qcfg.selectWordUnderCursor',
      selectWordUnderCursor,
    ),
    registerAsyncCommandWrapped(
      'qcfg.toggleRelativeLineNumbers',
      toggleRelativeNumbers,
    ),
  );
}

Modules.register(activate);
