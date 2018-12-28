'use strict';

import * as vscode from 'vscode';
import {window, workspace, commands} from 'vscode';
import {TextEditor, Selection} from 'vscode';
import {Logger, str} from './logging';
import {Stack} from 'typescript-collections';
import {registerCommand} from './utils';

type SelectionStack = Stack<Selection[]>;

const log = new Logger('selectionHistory');
const history = new Map<TextEditor, SelectionStack>();

function resetByEditor(editor: TextEditor)
{
  const stack = new Stack<Selection[]>();
  stack.push(editor.selections);
  history.set(editor, stack);
}

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
  const document = event.document;
  for (const [editor, stack] of history) {
    if (editor.document === document)
      resetByEditor(editor);
  }
}

function selectionsEqual(sel1: Selection[], sel2: Selection[]): boolean {
  if (sel1.length !== sel2.length)
    return false;
  for (let i = 0; i < sel1.length; ++i)
    if (!sel1[i].isEqual(sel2[i]))
      return false;
  return true;
}

function selectionsHaveSameAnchor(
    sel1: Selection[], sel2: Selection[]): boolean {
  if (sel1.length !== 1 || sel2.length !== 1)
    return false;
  return sel1[0].anchor.isEqual(sel2[0].anchor);
}

function onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent)
{
  const editor = event.textEditor;
  if (!editor.document || editor.document.uri.scheme !== 'file')
    return;
  // log.debug(`Selection changed on [${editor.viewColumn}] to ${str(event.selections)} (${event.kind})`);
  if (!history.has(editor)) {
    resetByEditor(editor);
    return;
  }
  const kind = event.kind;
  const stack = history.get(editor);
  const top = stack.peek();
  const selections = event.selections;
  if (selectionsEqual(top, selections))
    return;
  if (kind === vscode.TextEditorSelectionChangeKind.Mouse &&
      selectionsHaveSameAnchor(top, selections)) {
    stack.pop();
  } else {
    // log.debug(`${str(editor)} selection changed to ${str(selections)} (kind=${
    //     kind})`);
  }
  stack.push(selections);
}

function popSelection() {
  const editor = window.activeTextEditor;
  if (!history.has(editor))
    throw new Error(`selection not in stack`);
  const stack = history.get(editor);
  if (stack.isEmpty() || !selectionsEqual(stack.peek(), editor.selections)) {
    resetByEditor(editor);
    throw new Error(`selection not synchronized`);
  }
  stack.pop();
  if (stack.isEmpty())
    throw new Error('No previous selection');
  editor.selections = stack.peek();
}

export function activate(context: vscode.ExtensionContext) {
  for (const editor of window.visibleTextEditors)
    resetByEditor(editor);

  context.subscriptions.push(
      workspace.onDidChangeTextDocument(onDidChangeTextDocument),
      window.onDidChangeTextEditorSelection(onDidChangeTextEditorSelection),
      registerCommand('qcfg.selection.previous', popSelection));
}