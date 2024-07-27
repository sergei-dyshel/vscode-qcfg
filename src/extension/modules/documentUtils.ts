import type { TextDocument, TextDocumentContentChangeEvent } from "vscode";
import { Position, Range } from "vscode";
import { assert } from "../../library/exception";
import { maxNumber, minNumber } from "../../library/tsUtils";

export class NumRange {
  constructor(
    readonly start: number,
    readonly end: number,
  ) {
    assert(start <= end, "start > end");
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
    if (startDelta) return startDelta;
    return this.end - that.end;
  }

  equals(that: NumRange) {
    return this.compareTo(that) === 0;
  }

  contains(that: NumRange | number): boolean {
    if (typeof that === "number") return this.start <= that && that <= this.end;
    return this.contains(that.start) && this.contains(that.end);
  }

  intersection(that: NumRange): NumRange | undefined {
    const start = maxNumber(this.start, that.start);
    const end = minNumber(this.end, that.end);
    return start <= end ? new NumRange(start, end) : undefined;
  }

  union(that: NumRange): NumRange | undefined {
    if (this.intersection(that))
      return new NumRange(
        minNumber(this.start, that.start),
        maxNumber(this.end, that.end),
      );
    return undefined;
  }
}

export function rangeToOffset(document: TextDocument, range: Range): NumRange {
  return new NumRange(
    document.offsetAt(range.start),
    document.offsetAt(range.end),
  );
}

export function offsetToRange(document: TextDocument, range: NumRange): Range {
  return new Range(
    document.positionAt(range.start),
    document.positionAt(range.end),
  );
}

export function adjustOffsetRangeAfterChange(
  range: NumRange,
  changes: readonly TextDocumentContentChangeEvent[],
): NumRange | undefined {
  for (const change of changes.reverseIter()) {
    const changeStart = change.rangeOffset;
    const changeEnd = change.rangeOffset + change.rangeLength;
    const delta = change.text.length - change.rangeLength;
    if (range.isEmpty) {
      const pos = range.start;
      if (changeStart <= pos && changeEnd <= pos) range = range.shift(delta);
      else if (changeStart < pos && changeEnd > pos) return;
      else return range;
    } else if (changeStart <= range.start) {
      if (changeEnd < range.end)
        range = new NumRange(Math.max(range.start, changeEnd), range.end).shift(
          delta,
        );
      else return;
    } else if (changeEnd < range.end) {
      range = new NumRange(range.start, range.end + delta);
    } else {
      return new NumRange(range.start, Math.min(changeStart, range.end));
    }
  }
  return range;
}

export function adjustRangeAfterChange(
  document: TextDocument,
  range: Range,
  changes: TextDocumentContentChangeEvent[],
): Range | undefined {
  const adjusted = adjustOffsetRangeAfterChange(
    rangeToOffset(document, range),
    changes,
  );
  return adjusted ? offsetToRange(document, adjusted) : undefined;
}

export function getCompletionPrefix(
  document: TextDocument,
  position: Position,
  pattern = /(\w*)$/,
): string {
  const lineStart = position.with(undefined, 0);
  const text = document.getText(new Range(lineStart, position));
  const match = pattern.exec(text)!;
  return match[1];
}

function lineFirstNonWhitespaceCharacter(document: TextDocument, line: number) {
  return new Position(
    line,
    document.lineAt(line).firstNonWhitespaceCharacterIndex,
  );
}

export function lineIndentationRange(document: TextDocument, line: number) {
  return new Range(
    document.lineAt(line).range.start,
    lineFirstNonWhitespaceCharacter(document, line),
  );
}

export function lineIndentation(document: TextDocument, line: number): string {
  return document.getText(lineIndentationRange(document, line));
}

export function documentEnd(document: TextDocument) {
  return document.lineAt(document.lineCount - 1).range.end;
}

/**
 * Full range of text in document
 */
export function documentRange(document: TextDocument): Range {
  const firstLine = document.lineAt(0);
  return new Range(firstLine.range.start, documentEnd(document));
}

/** Entire text of the document */
export function documentText(document: TextDocument): string {
  return document.getText(documentRange(document));
}
