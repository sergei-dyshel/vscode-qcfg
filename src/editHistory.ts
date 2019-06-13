'use strict';

import * as vscode from 'vscode';
import {window, workspace} from 'vscode';
import {TextDocument, TextEditor, Selection, Range, Position} from 'vscode';
import {log} from './logging';
import {Stack} from 'typescript-collections';
import {getActiveTextEditor} from './utils';
import { registerCommandWrapped, listenWrapped } from './exception';
import { rangeToSelection } from './textUtils';

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
      listenWrapped(
          window.onDidChangeTextEditorSelection,
          onDidChangeTextEditorSelection),
      registerCommandWrapped('qcfg.selection.previous', popSelection));
}

// private

type SelectionStack = Stack<Range[]>;

const history = new Map<TextDocument, SelectionStack>();

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
  const document = event.document;
  history.set(document, new Stack<Range[]>());
  if (document.fileName.startsWith('extension-output'))
    return;
  // log.debug(`Changed ${str(event.document)}: ${str(event.contentChanges)}`);
}

function comparePositions(p1: Position, p2: Position) {
  if (p1.isBefore(p2))
    return -1;
  else if (p1.isEqual(p2))
    return 0;
  return 1;
}

function compareRanges(r1: Range, r2: Range) {
  const startCmp = comparePositions(r1.start, r2.start);
  if (startCmp !== 0)
    return startCmp;
  return comparePositions(r1.end, r2.end);
}

function sortedRanges(ranges: Range[]) {
  return [...ranges].sort(compareRanges);
}

function selectionsEqual(sel1: Range[], sel2: Range[]): boolean {
  if (sel1.length !== sel2.length)
    return false;
  const sorted1 = sortedRanges(sel1);
  const sorted2 = sortedRanges(sel2);
  for (let i = 0; i < sel1.length; ++i)
    if (!sorted1[i].isEqual(sorted2[i]))
      return false;
  return true;
}

enum SelectionChange {
  Equal = 'equal',
  Added = 'added',
  Removed = 'removed',
  Growed = 'growed',
  Shrinked = 'shrinked',
  Differ = 'differ'
}

export function detectSelectionChange(
    before: Range[], after: Range[]): SelectionChange {
  let change = SelectionChange.Equal as any;
  if (before.length < after.length)
    change = SelectionChange.Added;
  else if (before.length > after.length)
    change = SelectionChange.Removed;
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    const x = before[i];
    const y = after[j];
    switch (change) {
      case SelectionChange.Equal:
        if (x.isEqual(y)) {
        }
        if (x.contains(y))
          change = SelectionChange.Shrinked;
        if (y.contains(x))
          change = SelectionChange.Growed;
        else
          return SelectionChange.Differ;
        ++i;
        ++j;
        continue;
      case SelectionChange.Added:
        if (x.isEqual(y))
          ++i;
        ++j;
        continue;
      case SelectionChange.Removed:
        if (x.isEqual(y))
          ++j;
        ++i;
        continue;
      case SelectionChange.Growed:
        if (!y.contains(x))
          return SelectionChange.Differ;
        ++i;
        ++j;
        continue;
      case SelectionChange.Shrinked:
        if (!x.contains(y))
          return SelectionChange.Differ;
        ++i;
        ++j;
        continue;
    }
  }
  if ((change === SelectionChange.Added ||
       change === SelectionChange.Removed) &&
      (i !== before.length || j !== after.length))
    return SelectionChange.Differ;
  return change;
}

// function selectionsHaveSameAnchor(
//     sel1: Selection[], sel2: Selection[]): boolean {
//   if (sel1.length !== 1 || sel2.length !== 1)
//     return false;
//   return sel1[0].anchor.isEqual(sel2[0].anchor);
// }

function onDidChangeTextEditorSelection(event: vscode.TextEditorSelectionChangeEvent)
{
  const editor = event.textEditor;
  const document = editor.document;
  if (!document || document.uri.scheme !== 'file')
    return;
  // log.debug(`Selection changed on ${str(editor)} to ${str(event.selections)} (${
  //     event.kind})`);
  if (!history.has(document)) {
    history.set(document, new Stack<Range[]>());
    return;
  }
  // const kind = event.kind;
  const stack = log.assertNonNull(history.get(document));
  // const top = log.assertNonNull(stack.peek());
  const selections = event.selections;
  // if (selectionsEqual(top, selections))
  //   return;
  // if (kind === vscode.TextEditorSelectionChangeKind.Mouse &&
  //     selectionsHaveSameAnchor(top, selections)) {
    // stack.pop();
  // } else {
    // log.debug(`${str(editor)} selection changed to ${str(selections)} (kind=${
    //     kind})`);
  // }
  stack.push(selections);
}

function selectRanges(editor: TextEditor, ranges: Range[]) {
  const selection: Selection[] = [];
  for (const range of ranges)
    selection.push(rangeToSelection(range));
  editor.selections = selection;
}

function popSelection() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  if (!history.has(document))
    throw new Error(`selection not in stack`);
  const stack = log.assertNonNull(history.get(document));
  if (stack.isEmpty() ||
      !selectionsEqual(log.assertNonNull(stack.peek()), editor.selections)) {
    history.set(document, new Stack<Range[]>());
    throw new Error(`selection not synchronized`);
  }
  stack.pop();
  if (stack.isEmpty())
    throw new Error('No previous selection');
  selectRanges(editor, log.assertNonNull(stack.peek()));
}