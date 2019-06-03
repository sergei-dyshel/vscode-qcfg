'use strict';

import * as lc from 'vscode-languageclient';
import * as logging from './logging';
import * as nodejs from './nodejs';
import * as jsoncParser from 'jsonc-parser';

import * as vscode from 'vscode';

const log = logging.Logger.create('lang');

export function activate(_: vscode.ExtensionContext) {
  fetchLangConfigs();
}

export function getLanguageConfig(id: string): vscode.LanguageConfiguration|
    undefined {
  return langConfigs[id];
}

export function availableLanguageConfigs(): string[]
{
  return Object.keys(langConfigs);
}

export function isLspActive() {
  const extensions = ['cquery-project.cquery', 'ccls-project.ccls'];
  for (const extName of extensions) {
    const extension = vscode.extensions.getExtension(extName);
    if (extension && extension.isActive)
      return true;
  }
  return false;
}

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
    log.info(`Sent didSave for "${path}" to "${extension.id}`);
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

function fetchLangConfigs()
{
  for (const ext of vscode.extensions.all) {
    // All vscode default extensions ids starts with "vscode."
    if (ext.id.startsWith("vscode.") && ext.packageJSON.contributes &&
        ext.packageJSON.contributes.languages) {
      // Find language data from "packageJSON.contributes.languages" for the
      // languageId
      for (const langData of ext.packageJSON.contributes.languages) {
        const langId: string = langData.id;
        if (!langData.configuration) {
          log.info(`Could not get language config for "${langId}"`);
          continue;
        }
        const langFilePath =
            nodejs.path.join(ext.extensionPath, langData.configuration);
        const langConfig: vscode.LanguageConfiguration =
            jsoncParser.parse(nodejs.fs.readFileSync(langFilePath).toString());
        langConfigs[langId] = langConfig;
        log.info(`Got language config for "${langId}"`);
      }
    }
  }

  // for some reason """ is configured is block comment
  if (langConfigs.python && langConfigs.python.comments) {
    langConfigs.python.comments.blockComment = undefined;
  }
}

const langConfigs: {[id: string]: vscode.LanguageConfiguration} = {};