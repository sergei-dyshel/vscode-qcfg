'use strict';

import { TextDocument, Position, Range, TextEditor } from 'vscode';

// TODO: add as property to position class
export function offsetPosition(
  document: TextDocument,
  pos: Position,
  offset: number,
) {
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
        offsetPosition(document, range.end, -suffix.length),
      );
    }
  }
  return range;
}

export function selectRange(
  editor: TextEditor,
  range: Range,
  reversed?: boolean,
) {
  editor.selection = range.asSelection(reversed);
  editor.revealRange(range);
}

export function trimWhitespace(document: TextDocument, range: Range) {
  const text = document.getText(range);
  return new Range(
    offsetPosition(document, range.start, text.length - text.trimLeft().length),
    offsetPosition(
      document,
      range.end,
      -(text.length - text.trimRight().length),
    ),
  );
}

export function trimInner(document: TextDocument, range: Range) {
  return trimWhitespace(document, trimBrackets(document, range));
}

/**
 * Swap given ranges. Select range 1 or 2 or the one that was previously
 * selected (select === undefined) or none (select === none)
 */
export function swapRanges(
  editor: TextEditor,
  range1: Range,
  range2: Range,
  select?: 1 | 2 | null,
) {
  const document = editor.document;
  return editor.edit((edit) => {
    edit.replace(range1, document.getText(range2));
    edit.replace(range2, document.getText(range1));
    if (
      select === 1 ||
      (select === undefined && editor.selection.isEqual(range1))
    )
      selectRange(editor, range2);
    else if (
      select === 2 ||
      (select === undefined && editor.selection.isEqual(range2))
    )
      selectRange(editor, range1);
  });
}

const BRACKETS: Array<[string, string]> = [
  ['[', ']'],
  ['(', ')'],
  ['{', '}'],
  ['"""', '"""'],
  ["'''", "'''"],
  ['"', '"'],
  ["'", "'"],
  ['<', '>'],
  ['/*', '*/'],
  ['', ';'], // statements
];
