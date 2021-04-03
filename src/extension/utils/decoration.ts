import type {
  TextEditor,
  TextEditorDecorationType,
  ThemableDecorationRenderOptions,
  ThemeColor,
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

  static bracketStyle(params: {
    color: string | ThemeColor;
    width: number;
    radius?: number;
    style?: string;
  }): RangeDecorator {
    const w = params.width;
    const r = params.radius ?? w * 2;

    // top right bottom left
    const leftWidth = `${w}px 0px ${w}px ${w}px`;
    const rightWidth = `${w}px ${w}px ${w}px 0px`;

    // top-left top-right bottom-right bottom-left
    const leftRadius = `${r}px 0px 0px ${r}px`;
    const rightRadius = `0px ${r}px ${r}px 0px`;

    return new RangeDecorator(
      { borderWidth: leftWidth, borderRadius: leftRadius },
      { borderWidth: rightWidth, borderRadius: rightRadius },
      { borderStyle: params.style ?? 'solid', borderColor: params.color },
    );
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
