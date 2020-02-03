'use strict';

import { commands, TextEditor, window, WorkspaceFolder, Range } from 'vscode';
import { registerAsyncCommandWrapped } from './exception';
import { getDocumentWorkspaceFolder } from './fileUtils';
import { log } from './logging';

// XXX: currently unused
export namespace Context {
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

export function registerTemporaryCommand(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: (...args: any[]) => any,
  thisArg?: unknown,
) {
  tempCmdCounter += 1;
  const command = `qcfg.temp.${tempCmdCounter}`;
  const disposable = registerAsyncCommandWrapped(command, callback, thisArg);
  return { command, disposable };
}

let tempCmdCounter = 0;

export function getActiveTextEditor(): TextEditor {
  return log.assertNonNull(window.activeTextEditor, 'No active text editor');
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
