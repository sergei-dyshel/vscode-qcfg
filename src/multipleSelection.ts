'use strict';

import {
  TextEditor,
  ExtensionContext,
  window,
  TextEditorSelectionChangeEvent
} from 'vscode';
import { Modules } from './module';
import { listenWrapped, registerCommandWrapped } from './exception';
import { getActiveTextEditor } from './utils';
import { log } from './logging';

const selectionIndex = new Map<TextEditor, number>();
const decorationType = window.createTextEditorDecorationType({
  outline: '2px solid white'
});

function clearMark(editor: TextEditor) {
  selectionIndex.delete(editor);
  editor.setDecorations(decorationType, []);
}

function updateMark(editor: TextEditor, index: number) {
  const selections = editor.selections;
  if (index < 0 || index >= selections.length)
    throw new Error('Invalid selection index');
  selectionIndex.set(editor, index);
  const range = selections[index]!;
  editor.setDecorations(decorationType, []);
  editor.setDecorations(decorationType, [range]);
  editor.revealRange(range);
  log.debugStr(
    '{}: marking selection #{} out of {}, range {}',
    editor,
    index,
    selections.length,
    range
  );
}

function onSelectionChanged(event: TextEditorSelectionChangeEvent) {
  const editor = event.textEditor;
  const index = selectionIndex.get(editor);
  if (!index) {
    clearMark(editor);
    return;
  }
  const selections = event.selections;
  if (selections.length === 1) clearMark(editor);
  else if (index === selections.length - 2) updateMark(editor, index + 1);
  else if (index > selections.length - 1)
    updateMark(editor, selections.length - 1);
}

function unselectMarked() {
  const editor = getActiveTextEditor();
  const index = selectionIndex.get(editor);
  if (!index) return;
  editor.selections = editor.selections.filter((_, idx) => idx !== index);
  const selections = editor.selections;
  if (selections.length === 1) clearMark(editor);
  else if (index === selections.length - 2) updateMark(editor, index + 1);
  else if (index > selections.length - 1)
    updateMark(editor, selections.length - 1);
}

function moveMark(down: boolean) {
  const editor = getActiveTextEditor();
  const selections = editor.selections;
  if (selections.length === 1) return;
  const index = selectionIndex.get(editor);
  if (index !== undefined) {
    let newIndex = (index + (down ? 1 : -1)) % selections.length;
    if (newIndex === -1) newIndex = selections.length - 1;
    updateMark(editor, newIndex);
  } else {
    updateMark(editor, down ? 0 : selections.length - 1);
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(window.onDidChangeTextEditorSelection, onSelectionChanged),
    registerCommandWrapped(
      'qcfg.multipleSelection.unselectMarked',
      unselectMarked
    ),
    registerCommandWrapped('qcfg.multipleSelection.moveMarkDown', () =>
      moveMark(true /* down */)
    ),
    registerCommandWrapped('qcfg.multipleSelection.moveMarkUp', () =>
      moveMark(false /* up */)
    )
  );
}

Modules.register(activate);
