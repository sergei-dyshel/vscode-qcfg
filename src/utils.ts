'use strict';

import * as vscode from 'vscode';
import {Disposable, window, commands, TextEditor} from 'vscode';
import {Logger} from './logging';
import {getDocumentWorkspaceFolder} from './fileUtils';

import {promisify} from 'util';

const log = Logger.create('tree');

export const setTimeoutPromise = promisify(setTimeout);

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

function warnOnException(fn: any) {
  return (...args) => {
    try {
      return fn(...args);
    }
    catch (exc) {
      if (exc instanceof Error) {
        const err = exc as Error;
        window.showErrorMessage(`${err.name}: ${err.message}`);
      }
    }
  };
}

export function registerCommand(
    command: string, callback: (...args: any[]) => any,
    thisArg?: any): Disposable {
  return commands.registerCommand(command, warnOnException(callback), thisArg);
}

export function registerTemporaryCommand(callback: (...args: any[]) => any,
thisArg?: any) {
  const command = `qcfg.temp.${++tempCmdCounter}`;
  const disposable = registerCommand(command, callback, thisArg);
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
  return getDocumentWorkspaceFolder(editor.document);
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