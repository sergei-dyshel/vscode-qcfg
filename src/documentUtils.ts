'use strict';

import { TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, Range, Position } from 'vscode';
import { log } from './logging';
import { maxNumber, minNumber } from './tsUtils';

export class NumRange {
  constructor(readonly start: number, readonly end: number) {
    log.assert(start <= end, 'start > end');
  }

  get length() {
    return this.end - this.start;
  }

  static withLength(start: number, length: number) {
    return new NumRange(start, start + length);
  }

  toString() {
    return `[${this.start}-${this.end}]`;
  }

  get tuple() {
    return [this.start, this.end];
  }

  get isEmpty() {
    return this.length === 0;
  }

  shift(offset: number) {
    return new NumRange(this.start + offset, this.end + offset);
  }

  compareTo(that: NumRange) {
    const startDelta = this.start - that.start;
    if (startDelta)
      return startDelta;
    return this.end - that.end;
  }

  equals(that: NumRange) {
    return this.compareTo(that) === 0;
  }

  contains(that: NumRange|number): boolean {
    if (typeof that === 'number')
      return this.start <= that && that <= this.end;
    return this.contains(that.start) && this.contains(that.end);
  }

  intersection(that: NumRange): NumRange|undefined {
    const start = maxNumber(this.start, that.start);
    const end = minNumber(this.end, that.end);
    if (start <= end)
      return new NumRange(start, end);
  }

  union(that: NumRange): NumRange|undefined {
    if (this.intersection(that))
      return new NumRange(
          minNumber(this.start, that.start), maxNumber(this.end, that.end));
  }
}

/* REFACTOR: remove if not used */
export function sortDocumentChanges(event: TextDocumentChangeEvent):
    TextDocumentContentChangeEvent[] {
  const changes = [...event.contentChanges];
  changes.sort((a, b) => (a.rangeOffset - b.rangeOffset));
  return changes;
}

export function rangeToOffset(document: TextDocument, range: Range): NumRange {
  return new NumRange(
      document.offsetAt(range.start), document.offsetAt(range.end));
}

export function offsetToRange(document: TextDocument, range: NumRange): Range {
  return new Range(
      document.positionAt(range.start), document.positionAt(range.end));
}

export function adjustOffsetRangeAfterChange(
    range: NumRange, changes: TextDocumentContentChangeEvent[]): NumRange|
    undefined {
  for (const change of changes.reverseIter()) {
    const changeStart = change.rangeOffset;
    const changeEnd = change.rangeOffset + change.rangeLength;
    const delta = change.text.length - change.rangeLength;
    if (range.isEmpty) {
      const pos = range.start;
      if (changeStart <= pos && changeEnd <= pos)
        range = range.shift(delta);
      else if (changeStart < pos && changeEnd > pos)
        return;
      else
        return range;
    }
    else if (changeStart <= range.start) {
      if (changeEnd < range.end)
        range = new NumRange(Math.max(range.start, changeEnd), range.end)
                    .shift(delta);
      else
        return;
    } else {  // changeStart > range.start
      if (changeEnd < range.end)
        range = new NumRange(range.start, range.end + delta);
      else
        return new NumRange(range.start, Math.min(changeStart, range.end));
    }
  }
  return range;
}

export function adjustRangeAfterChange(
    document: TextDocument, range: Range,
    changes: TextDocumentContentChangeEvent[]): Range|undefined {
  const adjusted =
      adjustOffsetRangeAfterChange(rangeToOffset(document, range), changes);
  if (adjusted)
    return offsetToRange(document, adjusted);
}

export function getCompletionPrefix(
    document: TextDocument, position: Position): string {
  const lineStart = position.with(undefined, 0);
  const text = document.getText(new Range(lineStart, position));
  const match = text.match(/(\w*)$/)!;
  return match[1];
}

enum SelectionChange {
  Equal = 'equal',
  Added = 'added',
  Removed = 'removed',
  Growed = 'growed',
  Shrinked = 'shrinked',
  Differ = 'differ'
}

// REFACTOR: remove if not needed
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

declare module 'vscode' {
  export interface Range {
    compareTo(that: Range): number;
  }
}

Range.prototype.compareTo =
    function(this: Range, that: Range) {
  const startCmp = this.start.compareTo(that.start);
  if (startCmp !== 0)
    return startCmp;
  return this.end.compareTo(that.end);
};
