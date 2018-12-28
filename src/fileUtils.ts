'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';


export function getDocumentRoot(document: vscode.TextDocument) {
  const wsPath = vscode.workspace.asRelativePath(document.fileName, true);
  const relPath = vscode.workspace.asRelativePath(document.fileName, false);
  const [wsDir] = wsPath.split(path.sep, 1);
  for (const wsFolder of vscode.workspace.workspaceFolders) {
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