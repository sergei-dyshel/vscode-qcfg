'use strict';

import * as vscode from 'vscode';
import * as fileUtils from './fileUtils';
import { log } from './logging';
import { Modules } from './module';

export interface DocumentsInFolder {
  folder: vscode.WorkspaceFolder;
  documents: vscode.TextDocument[];
}

const savedFiles = new Map<vscode.WorkspaceFolder, vscode.TextDocument[]>();

const emmiter = new vscode.EventEmitter<DocumentsInFolder>();
export const onEvent: vscode.Event<DocumentsInFolder> = emmiter.event;

function emit() {
  savedFiles.forEach((documents, folder, _map) => {
    const docsInFolder: DocumentsInFolder = {folder, documents};
    emmiter.fire(docsInFolder);
  });
  savedFiles.clear();
}

function onDidSaveTextDocument(document: vscode.TextDocument) {
  const {workspaceFolder: wsFolder} =
      fileUtils.getDocumentRootThrowing(document);
  const docPath = vscode.workspace.asRelativePath(document.fileName);
  log.info('onDidSaveTextDocument:', docPath);

  if (savedFiles.has(wsFolder))
    log.assertNonNull(savedFiles.get(wsFolder)).push(document);
  else
    savedFiles.set(wsFolder, [document]);
  setTimeout(emit, 200);
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument));
}

Modules.register(activate);