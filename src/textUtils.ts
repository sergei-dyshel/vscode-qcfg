'use strict';

import {TextDocument, Position, Range, TextEditor, Selection} from 'vscode';


export function offsetPosition(
    document: TextDocument, pos: Position, offset: number) {
  return document.positionAt(document.offsetAt(pos) + offset);
}

export function rangeLength(document: TextDocument, range: Range) {
  return document.offsetAt(range.end) - document.offsetAt(range.start);
}

export function trimBrackets(document: TextDocument, range: Range) {
  const text = document.getText(range);
  for (const [prefix, suffix] of BRACKETS) {
    if (text.startsWith(prefix) && text.endsWith(suffix)) {
      return new Range(
          offsetPosition(document, range.start, prefix.length),
          offsetPosition(document, range.end, -suffix.length));
    }
  }
  return range;
}

export function isLinewise(range: Range) {
  return (
      range.start.character === 0 && range.end.character === 0 &&
      !range.isEmpty);
}

export function expandLinewise(range: Range) {
  return new Range(range.start.line, 0, range.end.line + 1, 0);
}

export function selectRange(editor: TextEditor, range: Range) {
  editor.selection = new Selection(range.start, range.end);
}

export function trimWhitespace(document: TextDocument, range: Range)
{
  const text = document.getText(range);
  return new Range(
      offsetPosition(
          document, range.start, text.length - text.trimLeft().length),
      offsetPosition(
          document, range.end, -(text.length - text.trimRight().length)));
}

export function trimInner(document: TextDocument, range: Range) {
  return trimWhitespace(document, trimBrackets(document, range));
}

const BRACKETS: Array<[string, string]> =
    [['[', ']'], ['(', ')'], ['{', '}'], ['"', '"'], ["'", "'"]];