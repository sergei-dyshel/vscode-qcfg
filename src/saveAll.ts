'use strict';

import * as vscode from 'vscode';
import * as fileUtils from './fileUtils';
import * as logging from './logging';

const log = logging.Logger.create('saveAll');

export interface DocumentsInFolder {
  folder: vscode.WorkspaceFolder;
  documents: vscode.TextDocument[];
}

const savedFiles = new Map<vscode.WorkspaceFolder, vscode.TextDocument[]>();

const emmiter = new vscode.EventEmitter<DocumentsInFolder>();
export const onEvent: vscode.Event<DocumentsInFolder> = emmiter.event;

let timer: NodeJS.Timer;

function emit() {
  savedFiles.forEach((documents, folder, map) => {
    const docsInFolder: DocumentsInFolder = {folder, documents};
    emmiter.fire(docsInFolder);
  });
  savedFiles.clear();
}

function onDidSaveTextDocument(document: vscode.TextDocument) {
  const {wsFolder} = fileUtils.getDocumentRoot(document);
  const docPath = vscode.workspace.asRelativePath(document.fileName);
  log.info('onDidSaveTextDocument:', docPath);

  if (savedFiles.has(wsFolder))
    log.assertNonNull(savedFiles.get(wsFolder)).push(document);
  else
    savedFiles.set(wsFolder, [document]);
  timer = setTimeout(emit, 200);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(onDidSaveTextDocument));
}
