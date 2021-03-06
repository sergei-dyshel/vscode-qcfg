'use strict';

import * as vscode from 'vscode';
import * as fileUtils from './fileUtils';
import { log } from '../../library/logging';
import { Modules } from './module';
import { assertNotNull } from '../../library/exception';

export interface DocumentsInFolder {
  folder: vscode.WorkspaceFolder;
  documents: vscode.TextDocument[];
}

const savedFiles = new Map<vscode.WorkspaceFolder, vscode.TextDocument[]>();

const emmiter = new vscode.EventEmitter<DocumentsInFolder>();
export const onEvent: vscode.Event<DocumentsInFolder> = emmiter.event;

function emit() {
  savedFiles.forEach((documents, folder, _map) => {
    const docsInFolder: DocumentsInFolder = { folder, documents };
    emmiter.fire(docsInFolder);
  });
  savedFiles.clear();
}

function onDidSaveTextDocument(document: vscode.TextDocument) {
  const { workspaceFolder: wsFolder } = fileUtils.getDocumentRootThrowing(
    document.fileName,
  );
  const docPath = vscode.workspace.asRelativePath(document.fileName);
  log.debug('onDidSaveTextDocument:', docPath);

  if (savedFiles.has(wsFolder)) {
    const docs = savedFiles.get(wsFolder);
    assertNotNull(docs);
    docs.push(document);
  } else savedFiles.set(wsFolder, [document]);
  setTimeout(emit, 200);
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument),
  );
}

Modules.register(activate);
