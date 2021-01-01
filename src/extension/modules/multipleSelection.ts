'use strict';

import type {
  TextEditor,
  ExtensionContext,
  TextEditorSelectionChangeEvent,
} from 'vscode';
import { window } from 'vscode';
import { Modules } from './module';
import {
  listenWrapped,
  registerSyncCommandWrapped,
  handleAsyncStd,
} from './exception';
import { getActiveTextEditor, WhenContext } from './utils';
import { log } from '../../library/logging';

const CONTEXT = 'qcfgMultipleSelectionsMarker';

const selectionIndex = new Map<TextEditor, number>();
const decorationType = window.createTextEditorDecorationType({
  outline: '2px solid white',
});

function clearMark(editor: TextEditor) {
  selectionIndex.delete(editor);
  editor.setDecorations(decorationType, []);
  handleAsyncStd(WhenContext.clear(CONTEXT));
}

function updateMark(editor: TextEditor, index: number) {
  const selections = editor.selections;
  if (index < 0 || index >= selections.length)
    throw new Error('Invalid selection index');
  selectionIndex.set(editor, index);
  const range = selections[index];
  editor.setDecorations(decorationType, []);
  editor.setDecorations(decorationType, [range]);
  editor.revealRange(range);
  handleAsyncStd(WhenContext.set(CONTEXT));
  log.debugStr(
    '{}: marking selection #{} out of {}, range {}',
    editor,
    index,
    selections.length,
    range,
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

function resetToMark() {
  const editor = getActiveTextEditor();
  const index = selectionIndex.get(editor)!;
  editor.selection = editor.selections[index];
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(window.onDidChangeTextEditorSelection, onSelectionChanged),
    registerSyncCommandWrapped(
      'qcfg.multipleSelection.unselectMarked',
      unselectMarked,
    ),
    registerSyncCommandWrapped('qcfg.multipleSelection.moveMarkDown', () => {
      moveMark(true /* down */);
    }),
    registerSyncCommandWrapped('qcfg.multipleSelection.moveMarkUp', () => {
      moveMark(false /* up */);
    }),
    registerSyncCommandWrapped('qcfg.multipleSelection.resetToMark', () => {
      resetToMark();
    }),
  );
}

Modules.register(activate);
