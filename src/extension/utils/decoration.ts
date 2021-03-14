import type {
  TextEditor,
  TextEditorDecorationType,
  ThemableDecorationRenderOptions,
} from 'vscode';
import { Range, window } from 'vscode';
import { offsetPosition } from '../modules/textUtils';

export class RangeDecorator {
  left: TextEditorDecorationType;
  right: TextEditorDecorationType;
  constructor(
    left: ThemableDecorationRenderOptions,
    right: ThemableDecorationRenderOptions,
    common?: ThemableDecorationRenderOptions,
  ) {
    this.left = window.createTextEditorDecorationType({ ...common, ...left });
    this.right = window.createTextEditorDecorationType({ ...common, ...right });
  }

  decorate(editor: TextEditor, ranges: Range[]) {
    const document = editor.document;
    function rangeFirstChar(range: Range): Range {
      return new Range(range.start, offsetPosition(document, range.start, 1));
    }
    function rangeLastChar(range: Range): Range {
      return new Range(offsetPosition(document, range.end, -1), range.end);
    }
    const firstChars = ranges.map(rangeFirstChar);
    const lastChars = ranges.map(rangeLastChar);
    editor.setDecorations(this.left, firstChars);
    editor.setDecorations(this.right, lastChars);
  }

  clear(editor: TextEditor) {
    this.decorate(editor, []);
  }
}
