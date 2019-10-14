'use strict';

import * as vscode from 'vscode';
import { commands, TextEditor, window } from 'vscode';
import { registerCommandWrapped } from './exception';
import { getDocumentWorkspaceFolder } from './fileUtils';
import { log } from './logging';


export interface DisposableLike {
  dispose(): any;
}

// XXX: currently unused
export namespace Context {
  const contexts = new Set<string>();

  export function has(name: string): boolean {
    return contexts.has(name);
  }

  export function set(name: string) {
    setOrClear(name, true);
  }

  export function clear(name: string) {
    setOrClear(name, false);
  }

  function setOrClear(name: string, value: boolean) {
    commands.executeCommand('setContext', name, value);
    if (value)
      contexts.add(name);
    else
      contexts.delete(name);
  }
}

export function registerTemporaryCommand(callback: (...args: any[]) => any,
thisArg?: any) {
  const command = `qcfg.temp.${++tempCmdCounter}`;
  const disposable = registerCommandWrapped(command, callback, thisArg);
  return {command, disposable};
}

let tempCmdCounter = 0;

export function getActiveTextEditor(): TextEditor {
  return log.assertNonNull(window.activeTextEditor, "No active text editor");
}

export function currentWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
  const editor = window.activeTextEditor;
  if (!editor)
    return;
  return getDocumentWorkspaceFolder(editor.document.fileName);
}

export interface CursorWordContext {
  editor: vscode.TextEditor;
  range: vscode.Range;
  word: string;
}

export function getCursorWordContext(): CursorWordContext | undefined {
  const editor = window.activeTextEditor;
  if (!editor)
    return;
  const range = editor.document.getWordRangeAtPosition(editor.selection.active);
  if (!range)
    return;
  const word = editor.document.getText(range);
  return {editor, range, word};
}