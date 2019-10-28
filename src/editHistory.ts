'use strict';

import { ExtensionContext, Range, Selection, TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, TextEditor, workspace } from 'vscode';
import { adjustOffsetRangeAfterChange, NumRange, offsetToRange, rangeToOffset } from './documentUtils';
import { listenWrapped, registerCommandWrapped, CheckError } from './exception';
import { Logger } from './logging';
import { DefaultMap, filterNonNull } from './tsUtils';
import { getActiveTextEditor } from './utils';
import { Modules } from './module';
import * as nodejs from './nodejs';
import { LiveRange } from './liveLocation';
import { offsetPosition } from './textUtils';

const HISTORY_SIZE = 10;
// private

/* TODO: unexport */
export abstract class History<T> {
  protected backward: T[] = [];
  protected forward: T[] = [];
  private cutForward: boolean;

  abstract goTo(state: T): void;

  constructor(private maxSize: number, opts?: {cutForward: boolean}) {
    this.cutForward = opts && opts.cutForward ? true : false;
  }

  top(): T|undefined {
    return this.backward.top;
  }

  replaceTop(state: T) {
    this.backward.pop();
    if (!this.cutForward)
      this.backward.concat(this.forward.reverse());
    this.backward.push(state);
    this.forward = [];
  }

  push(state: T) {
    this.forward = [];
    if (!this.cutForward)
      this.backward.concat(this.forward.reverse());
    this.backward.push(state);
    if (this.backward.length > this.maxSize)
      this.backward.shift();
  }

  goBackward() {
    const state = this.backward.pop();
    if (!state)
      throw new CheckError('No backward history');
    this.forward.push(state);
    this.goTo(state);
  }

  goForward() {
    const state = this.forward.pop();
    if (!state)
      throw new CheckError('No forward history');
    this.backward.push(state);
    this.goTo(state);
  }

  remove(state: T) {
    this.forward.removeFirst(state);
    this.backward.removeFirst(state);
  }
}

class DocumentHistory {
  private ranges: LiveRange[];
  private index = 0;

  constructor(private document: TextDocument) {
    const base = nodejs.path.parse(document.fileName).base;
    this.log = new Logger({instance: base, level: 'trace'});
  }
  private savedSelection?: Selection;

  processTextChange(change: TextDocumentContentChangeEvent) {
    if (change.text.length === 0)
      return;
    this.log.trace(change);
    const range = new Range(
        change.range.start,
        offsetPosition(this.document, change.range.start, change.text.length));
    const lrange = new LiveRange(this.document, range, {
      mergeOnReplace: true,
      onInvalidated: () => {
        this.ranges.removeFirst(lrange);
      }
    });
    this.savedSelection = undefined;
    this.ranges.push(lrange);
    if (this.ranges.length > HISTORY_SIZE)
      this.ranges.shift();
    this.index = this.ranges.length;
    this.log.trace('Pushing', lrange);
  }

  goBackward(selection: Selection): Selection {
    if (!this.savedSelection)
      this.savedSelection = selection;
    else if (this.index === 0)
      throw new CheckError('No backward  history');
    else
      --this.index;
    this.log.debugStr(
        'Going backward, ({} more backward items, {} forward items)',
        this.index, this.ranges.length - this.index);
    return this.ranges[this.index].range.asSelection();
  }

  goForward(): Selection {
    if (this.index === this.ranges.length) {
      if (this.savedSelection) {
        const selection = this.savedSelection;
        this.savedSelection = undefined;
        return selection;
      } else
        throw new CheckError('No more forward history');
    }
    ++this.index;
    this.log.debugStr(
      'Going forward, ({} more backward items, {} forward items)',
      this.index, this.ranges.length - this.index);
   this.backward.push(this.forward.pop()!);
    return this.forward.top!;
  }

  private log: Logger;
}

const history = new DefaultMap<TextDocument, DocumentHistory>(
    (document) => new DocumentHistory(document));

function textChangeToRanges(changes: readonly TextDocumentContentChangeEvent[]):
    NumRange[] {
  const ranges: NumRange[] = [];
  let delta = 0;
  for (const change of changes.reverseIter()) {
    if (change.text !== "")
      ranges.push(
          NumRange.withLength(change.rangeOffset + delta, change.text.length));
    delta += (change.text.length - change.rangeLength);
  }
  return ranges;
}

function adjustRangesAfterChange(
    ranges: NumRange[],
    changes: readonly TextDocumentContentChangeEvent[]): NumRange[] {
  return filterNonNull(
      ranges.map(range => adjustOffsetRangeAfterChange(range, changes)));
}

function tryMerge(x: NumRange[], y: NumRange[]): NumRange[]|undefined {
  if (x.length !== y.length)
    return;
  const result: NumRange[] = [];
  for (let i = 0; i < x.length; ++i) {
    const merged = x[i].union(y[i]);
    if (!merged)
      return;
    result.push(merged);
  }
  return result;
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const document = event.document;
  if (document.fileName.startsWith('extension-output'))
    return;
  if (event.contentChanges.isEmpty)
    return;
  const docHistory = history.get(document);
  docHistory.processTextChange(event.contentChanges);
}

function selectRanges(editor: TextEditor, ranges: Range[]) {
  const selections: Selection[] = [];
  if (!ranges.length)
    return;
  for (const range of ranges)
    selections.push(range.asSelection());
  editor.selections = selections;
  editor.revealRange(new Range(ranges[0].start, ranges.top!.end));
}

function rangesToOffset(document: TextDocument, ranges: Range[]): NumRange[] {
  return ranges.map(range => rangeToOffset(document, range));
}

function offsetToRanges(document: TextDocument, ranges: NumRange[]): Range[] {
  return ranges.map(range => offsetToRange(document, range));
}

function goBackward() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const docHistory = history.get(document);
  const offsetRanges  = docHistory.goBackward(editor.selections);
  selectRanges(editor, offsetToRanges(document, offsetRanges));
}

function goForward() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const docHistory = history.get(document);
  const offsetRanges = docHistory.goForward();
  selectRanges(editor, offsetToRanges(document, offsetRanges));
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
      registerCommandWrapped('qcfg.edit.previous', goBackward),
      registerCommandWrapped('qcfg.edit.next', goForward));
}

Modules.register(activate);
