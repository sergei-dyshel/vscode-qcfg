'use strict';

import * as vscode from 'vscode';
import { Uri } from 'vscode';
import { assertNotNull } from '../../library/exception';
import { log } from '../../library/logging';
import * as fileUtils from './fileUtils';
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
    const docsInFolder: DocumentsInFolder = { folder, documents };
    emmiter.fire(docsInFolder);
  });
  savedFiles.clear();
}

function onDidSaveTextDocument(document: vscode.TextDocument) {
  const uri = document.uri;
  const realUri =
    uri.scheme === 'file' ? Uri.file(fileUtils.realPathSync(uri.fsPath)) : uri;
  const wsFolder = vscode.workspace.getWorkspaceFolder(realUri);
  if (!wsFolder) {
    log.debug(`Saved file ${realUri} is not in workspace`);
    return;
  }
  log.debug(
    `onDidSaveTextDocument:`,
    vscode.workspace.asRelativePath(realUri, true),
  );

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
