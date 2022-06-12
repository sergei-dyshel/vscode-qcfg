import { Range, TextEditor } from 'vscode';

/** Best effort to reveal selection */
export function revealSelection(editor: TextEditor) {
  const selections = editor.selections;
  if (selections.length > 1) {
    const start = selections.map((sel) => sel.start).min()!;
    const end = selections.map((sel) => sel.end).min()!;
    editor.revealRange(new Range(start, end));
    return;
  }
  const selection = editor.selection;
  editor.revealRange(selection);
  editor.revealRange(selection.active.asRange);
}
