'use strict';

import { ExtensionContext, Range, Selection, TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, TextEditor, TextEditorSelectionChangeEvent, window, workspace } from 'vscode';
import { adjustOffsetRangeAfterChange, NumRange, offsetToRange, rangeToOffset } from './documentUtils';
import { listenWrapped, registerCommandWrapped, CheckError } from './exception';
import { Logger, str } from './logging';
import { rangeToSelection } from './textUtils';
import { DefaultMap, filterNonNull } from './tsUtils';
import { getActiveTextEditor } from './utils';
import { Modules } from './module';
import * as nodejs from './nodejs';

// private

class DocumentHistory {
  constructor(private document: TextDocument) {
    const base = nodejs.path.parse(document.fileName).base;
    this.log = new Logger({instance: base, level: 'trace'});
  }
  private backward: NumRange[][] = [];
  private forward: NumRange[][] = [];

  private savedSelection?: NumRange[];

  processTextChange(changes: TextDocumentContentChangeEvent[]) {
    /// #if DEBUG
    this.log.trace(`${str(changes)}`);
    /// #endif
    this.backward = this.backward.concat(this.forward.reverse());
    this.forward = [];
    const prevBackward = this.backward;
    this.backward =
        this.backward.map(ranges => adjustRangesAfterChange(ranges, changes))
            .filter(ranges => ranges.length > 0);
    /// #if DEBUG
    this.log.trace(`changed history from ${str(prevBackward)} to ${
        str(this.backward)}`);
    /// #endif
    const ranges = textChangeToRanges(changes);
    /// #if DEBUG
    this.log.trace(`current ranges ${str(ranges)}`);
    /// #endif
    if (this.backward.notEmpty) {
      /// #if DEBUG
      this.log.trace(`previous ranges ${this.backward.top!}`);
      /// #endif
      const merge = tryMerge(this.backward.top!, ranges);
      if (merge) {
        this.backward.pop();
        this.backward.push(merge);
        /// #if DEBUG
        this.log.trace(`Merged with previous, pushing ${str(merge)}`);
        /// #endif
        return;
      }
    }
    this.backward.push(ranges);
    /// #if DEBUG
    this.log.trace(`Pushing ${str(ranges)}`);
    /// #endif
  }

  goBackward(selection: Selection[]): NumRange[] {
    if (this.backward.empty)
      throw new CheckError('No backward  history');
    const ranges = this.backward.pop()!;
    const selectionRanges = rangesToOffset(this.document, selection);
    selectionRanges.sort(NumRange.prototype.compareTo);
    if (ranges.equals(selectionRanges, NumRange.prototype.equals)) {
      /* TODO:  */
    }
    if (this.forward.empty)
      this.savedSelection = selectionRanges;
    this.forward.push(ranges);
    this.log.debug(
        `Going backward (${this.backward.length} more backward items, ${
            this.forward.length} forward items)`);
    return ranges;
  }

  goForward(): NumRange[] {
    if (this.forward.empty)
      throw new CheckError('No more forward history');
    this.backward.push(this.forward.pop()!);
    this.log.debug(`Going forward (${this.backward.length} backward items, ${
        this.forward.length} forward items)`);
    if (this.forward.empty)
      return this.savedSelection!;
    return this.forward.top!;
  }

  private log: Logger;
}

const history = new DefaultMap<TextDocument, DocumentHistory>(
    (document) => new DocumentHistory(document));

function textChangeToRanges(changes: TextDocumentContentChangeEvent[]):
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
    ranges: NumRange[], changes: TextDocumentContentChangeEvent[]): NumRange[] {
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
  if (event.contentChanges.empty)
    return;
  const docHistory = history.get(document);
  docHistory.processTextChange(event.contentChanges);
}

function onDidChangeTextEditorSelection(_: TextEditorSelectionChangeEvent) {}

function selectRanges(editor: TextEditor, ranges: Range[]) {
  const selections: Selection[] = [];
  if (!ranges.length)
    return;
  for (const range of ranges)
    selections.push(rangeToSelection(range));
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
      listenWrapped(
          window.onDidChangeTextEditorSelection,
          onDidChangeTextEditorSelection),
      registerCommandWrapped('qcfg.edit.previous', goBackward),
      registerCommandWrapped('qcfg.edit.next', goForward));
}

Modules.register(activate);
