import { Position, Range } from 'vscode';

declare module 'vscode' {
  export interface Position {
    readonly asRange: Range;
    offset(offs: { line?: number; character?: number }): Position;
    withLine(line: number): Position;
    withCharacter(characer: number): Position;
  }
}

Position.prototype.offset = function(
  this: Position,
  offset: { line?: number; character?: number },
) {
  return this.with(
    this.line + (offset.line || 0),
    this.character + (offset.character || 0),
  );
};

Position.prototype.withLine = function(this: Position, line: number) {
  return this.with(line);
};

Position.prototype.withCharacter = function(this: Position, character: number) {
  return this.with(undefined, character);
};

Object.defineProperty(Position.prototype, 'asRange', {
  get() {
    return new Range(this, this);
  },
});
