'use strict';

import * as lc from 'vscode-languageclient';
import * as logging from './logging';

import * as vscode from 'vscode';
import { extname } from 'path';

const log = new logging.Logger('lang');

export function sendDidSave(document: vscode.TextDocument) {
  const params: lc.DidSaveTextDocumentParams = {
    textDocument: {
      uri: document.uri.toString(),
      version: null
    }
  };

  const extensions = ['cquery-project.cquery', 'ccls-project.ccls'];
  for (const extName of extensions) {
    const extension = vscode.extensions.getExtension(extName);
    if (!extension || !extension.isActive)
      continue;
    const exports: object = extension.exports;
    if (typeof (exports) !== 'object' || !('languageClient' in exports))
      continue;
    const langClient: lc.LanguageClient = exports['languageClient'];

    langClient.sendNotification('textDocument/didSave', params);
    const path = vscode.workspace.asRelativePath(document.fileName);
    log.info(`Sent didSave for "${path}" to "${extname}`);
  }
}

export function reindex() {
  const cquery = vscode.extensions.getExtension('cquery-project.cquery');
  const ccls = vscode.extensions.getExtension('ccls-project.ccls');
  if (cquery && cquery.isActive) {
    vscode.commands.executeCommand('cquery.freshenIndex');
  } else if (ccls && ccls.isActive) {
    vscode.commands.executeCommand('ccls.reload');
  }
}
