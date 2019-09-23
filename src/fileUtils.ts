'use strict';

import * as vscode from 'vscode';
import * as nodejs from './nodejs';

import { log } from './logging';
import { Uri } from 'vscode';

export function getDocumentRoot(document: vscode.TextDocument) {
  const wsPath = vscode.workspace.asRelativePath(document.fileName, true);
  const relativePath = vscode.workspace.asRelativePath(document.fileName, false);
  const [wsDir] = wsPath.split(nodejs.path.sep, 1);
  for (const workspaceFolder of (vscode.workspace.workspaceFolders || [])) {
    if (workspaceFolder.name === wsDir)
      return {workspaceFolder, relativePath};
  }
  return;
}

export function getDocumentRootThrowing(document: vscode.TextDocument) {
  return log.assertNonNull(
      getDocumentRoot(document),
      `Could not get workspace folder of ${document.fileName}`);
}

export function getDocumentWorkspaceFolder(document: vscode.TextDocument)
{
  const docRoot = getDocumentRoot(document);
  if (docRoot)
    return docRoot.workspaceFolder;
}

export const exists = nodejs.util.promisify(nodejs.fs.exists);

export function existsInRoot(
    wsFolder: vscode.WorkspaceFolder, fileName: string) {
  return exists(nodejs.path.join(wsFolder.uri.fsPath, fileName));
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
      log.error(`Tag '${options.tag}' not found in ${filePath}:${options.line}`);
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

export async function readJSON(path: string): Promise<any> {
  return JSON.parse(new nodejs.util.TextDecoder('utf-8').decode(
      await vscode.workspace.fs.readFile(Uri.file(path))));
}