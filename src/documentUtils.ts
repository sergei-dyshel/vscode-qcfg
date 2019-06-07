'use strict';

import { TextDocument, TextDocumentChangeEvent, TextDocumentContentChangeEvent, Range, Position } from 'vscode';
import { log } from './logging';

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
}

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
    range: NumRange, changes: TextDocumentContentChangeEvent[]): NumRange {
  let delta = 0;
  for (const change of changes) {
    if (change.rangeOffset + change.rangeLength <= range.start)
      delta += change.text.length - change.rangeLength;
    else
      break;
  }
  return range.shift(delta);
}

export function adjustRangeAfterChange(
    document: TextDocument, range: Range,
    changes: TextDocumentContentChangeEvent[]): Range {
  return offsetToRange(
      document,
      adjustOffsetRangeAfterChange(rangeToOffset(document, range), changes));
}

export function getCompletionPrefix(
    document: TextDocument, position: Position): string {
  const lineStart = position.with(undefined, 0);
  const text = document.getText(new Range(lineStart, position));
  const match = text.match(/(\w*)$/)!;
  return match[1];
}