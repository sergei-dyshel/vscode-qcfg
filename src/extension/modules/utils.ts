import type { Range, TextEditor, WorkspaceFolder } from "vscode";
import { commands, Location, window } from "vscode";
import { assertNotNull } from "../../library/exception";
import type { VoidFunction } from "../../library/templateTypes";
import { getDocumentWorkspaceFolder } from "../utils/document";
import { registerSyncCommandWrapped } from "./exception";

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
    await commands.executeCommand("setContext", name, value);
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
  assertNotNull(editor, "No active text editor");
  return editor;
}

export function getCurrentLocation() {
  const editor = getActiveTextEditor();
  return new Location(editor.document.uri, editor.selection);
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
  location: Location;
}

export function getCursorWordContext(): CursorWordContext | undefined {
  const editor = window.activeTextEditor;
  if (!editor) return;
  const document = editor.document;
  const range = document.getWordRangeAtPosition(editor.selection.active);
  if (!range) return;
  const word = document.getText(range);
  const location = new Location(document.uri, range);
  return { editor, range, word, location };
}
