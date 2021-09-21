'use strict';

import type { Range, TextEditor, WorkspaceFolder } from 'vscode';
import { commands, window } from 'vscode';
import { assertNotNull } from '../../library/exception';
import type { VoidFunction } from '../../library/templateTypes';
import { registerSyncCommandWrapped } from './exception';
import { getDocumentWorkspaceFolder } from './fileUtils';

// XXX: currently unused
export namespace WhenContext {
  const contexts = new Set<string>();

  export function has(name: string): boolean {
    return contexts.has(name);
  }

  export async function set(name: string) {
    await setOrClear(name, true);
  }

  export async function clear(name: string) {
    await setOrClear(name, false);
  }

  async function setOrClear(name: string, value: boolean) {
    await commands.executeCommand('setContext', name, value);
    if (value) contexts.add(name);
    else contexts.delete(name);
  }
}

export function registerSyncTemporaryCommand(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: VoidFunction,
  thisArg?: unknown,
) {
  tempCmdCounter += 1;
  const command = `qcfg.temp.${tempCmdCounter}`;
  const disposable = registerSyncCommandWrapped(command, callback, thisArg);
  return { command, disposable };
}

let tempCmdCounter = 0;

export function getActiveTextEditor(): TextEditor {
  const editor = window.activeTextEditor;
  assertNotNull(editor, 'No active text editor');
  return editor;
}

export function currentWorkspaceFolder(): WorkspaceFolder | undefined {
  const editor = window.activeTextEditor;
  if (!editor) return;
  return getDocumentWorkspaceFolder(editor.document.fileName);
}

export interface CursorWordContext {
  editor: TextEditor;
  range: Range;
  word: string;
}

export function getCursorWordContext(): CursorWordContext | undefined {
  const editor = window.activeTextEditor;
  if (!editor) return;
  const range = editor.document.getWordRangeAtPosition(editor.selection.active);
  if (!range) return;
  const word = editor.document.getText(range);
  return { editor, range, word };
}
