import { Range, Selection } from 'vscode';

declare module 'vscode' {
  export interface Range {
    compareTo(that: Range): number;
    strictlyContains(that: Range): boolean;
    asSelection(reverse?: boolean): Selection;
    expandLinewise(): Range;

    isLinewise: boolean;
  }
}

Range.prototype.compareTo = function(this: Range, that: Range) {
  const startCmp = this.start.compareTo(that.start);
  if (startCmp !== 0) return startCmp;
  return this.end.compareTo(that.end);
};

Range.prototype.asSelection = function(this: Range, reverse = false) {
  const anchor = reverse ? this.end : this.start;
  const active = reverse ? this.start : this.end;
  return new Selection(anchor, active);
};

Range.prototype.strictlyContains = function(this: Range, that: Range) {
  return this.contains(that) && !this.isEqual(that);
};

Object.defineProperty(Range.prototype, 'isLinewise', {
  get() {
    return (
      this.start.character === 0 && this.end.character === 0 && !this.isEmpty
    );
  },
});

Range.prototype.expandLinewise = function(this: Range) {
  return new Range(
    this.start.withCharacter(0),
    this.end.with(
      this.end.character === 0 ? this.end.line : this.end.line + 1,
      0 /* character */,
    ),
  );
};
