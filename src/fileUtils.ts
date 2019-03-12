'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';

import * as logging from './logging';

const log = logging.Logger.create('fileUtils');

export function getDocumentRoot(document: vscode.TextDocument) {
  const wsPath = vscode.workspace.asRelativePath(document.fileName, true);
  const relPath = vscode.workspace.asRelativePath(document.fileName, false);
  const [wsDir] = wsPath.split(path.sep, 1);
  for (const wsFolder of (vscode.workspace.workspaceFolders || [])) {
    if (wsFolder.name === wsDir)
      return {wsFolder, relPath};
  }
  throw new Error("Could not detect workspace folder of document");
}

export const exists = util.promisify(fs.exists);

export function existsInRoot(
    wsFolder: vscode.WorkspaceFolder, fileName: string) {
  return exists(path.join(wsFolder.uri.fsPath, fileName));
}

export async function openLocation(
    filePath: string, options: {line?: number, column?: number, tag?: string}) {
  const line0 = (options && options.line) ? options.line - 1 : 0;
  let col0 = (options && options.column) ? options.column - 1 : 0;

  let editor = vscode.window.activeTextEditor;
  const mustOpenNewEditor = !editor || editor.document.uri.fsPath !== filePath;
  const document = mustOpenNewEditor ?
      await vscode.workspace.openTextDocument(filePath) :
      log.assertNonNull(editor).document;

  if (options && options.tag) {
    log.assertNull(options.column, 'Can not specify tag and column together');
    log.assertNonNull(options.line, 'Can not specify "tag" without "line"');
    const lineText = document.lineAt(line0);
    col0 = lineText.text.indexOf(options.tag);
    if (col0 === -1) {
      log.error(`Tag "${options.tag}" not found in ${filePath}:${options.line}`);
      col0 = 0;
    }
  }
  const pos = new vscode.Position(line0, col0);
  const selection = new vscode.Selection(pos, pos);
  if (mustOpenNewEditor) {
    const viewColumn: vscode.ViewColumn|undefined =
        editor ? editor.viewColumn : undefined;
    editor =
        await vscode.window.showTextDocument(document, {viewColumn, selection});
    editor.show();
    return;
  }
  editor!.selection = selection;
  editor!.revealRange(editor!.selection);
}