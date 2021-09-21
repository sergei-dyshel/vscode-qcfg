/* eslint-disable @typescript-eslint/unbound-method */
import { Position, Range, Selection } from 'vscode';

declare module 'vscode' {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export interface Range {
    compareTo: (that: Range) => number;
    strictlyContains: (that: Range) => boolean;
    asSelection: (reverse?: boolean) => Selection;
    expandLinewise: () => Range;
    toString: () => string;

    isLinewise: boolean;
  }

  // eslint-disable-next-line no-shadow
  export namespace Range {
    /* TODO: move to position prototype */
    function fromPosition(position: Position): Range;
    function compare(range1: Range, range2: Range): number;
  }
}

Range.prototype.compareTo = function (this: Range, that: Range) {
  const startCmp = this.start.compareTo(that.start);
  if (startCmp !== 0) return startCmp;
  return this.end.compareTo(that.end);
};

Range.prototype.asSelection = function (this: Range, reverse = false) {
  const anchor = reverse ? this.end : this.start;
  const active = reverse ? this.start : this.end;
  return new Selection(anchor, active);
};

Range.prototype.strictlyContains = function (this: Range, that: Range) {
  return this.contains(that) && !this.isEqual(that);
};

Object.defineProperty(Range.prototype, 'isLinewise', {
  get() {
    return (
      this.start.character === 0 && this.end.character === 0 && !this.isEmpty
    );
  },
});

Range.prototype.expandLinewise = function (this: Range) {
  return new Range(
    this.start.withCharacter(0),
    this.end.with(
      this.end.character === 0 && !this.start.isEqual(this.end)
        ? this.end.line
        : this.end.line + 1,
      0 /* character */,
    ),
  );
};

Range.prototype.toString = function (this: Range) {
  if (this.isEmpty) return `${this.start}`;
  return `${this.start}=${this.end}`;
};

Range.fromPosition = function (position: Position) {
  return new Range(position, position);
};

Range.compare = function (range1: Range, range2: Range): number {
  return (
    Position.compare(range1.start, range2.start) ||
    Position.compare(range1.end, range2.end)
  );
};
