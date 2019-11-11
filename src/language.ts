'use strict';

import * as lc from 'vscode-languageclient';
import { log } from './logging';
import * as nodejs from './nodejs';

import * as vscode from 'vscode';
import { Modules } from './module';
import { parseJsonFileSync } from './json';

export const colorThemeFiles: { [id: string]: string } = {};

export function getLanguageConfig(
  id: string,
): vscode.LanguageConfiguration | undefined {
  return langConfigs[id];
}

export function availableLanguageConfigs(): string[] {
  return Object.keys(langConfigs);
}

export function isLspActive() {
  const extensions = ['cquery-project.cquery', 'ccls-project.ccls'];
  for (const extName of extensions) {
    const extension = vscode.extensions.getExtension(extName);
    if (extension && extension.isActive) return true;
  }
  return false;
}

export function sendDidSave(document: vscode.TextDocument) {
  const params: lc.DidSaveTextDocumentParams = {
    textDocument: {
      uri: document.uri.toString(),
      version: null,
    },
  };

  const extensions = ['cquery-project.cquery', 'ccls-project.ccls'];
  for (const extName of extensions) {
    const extension = vscode.extensions.getExtension(extName);
    if (!extension || !extension.isActive) continue;
    const exports = extension.exports;
    if (typeof exports !== 'object' || !('languageClient' in exports)) continue;
    const langClient: lc.LanguageClient = exports.languageClient;

    langClient.sendNotification('textDocument/didSave', params);
    const path = vscode.workspace.asRelativePath(document.fileName);
    log.info(`Sent didSave for "${path}" to "${extension.id}`);
  }
}

export async function reindex() {
  const cquery = vscode.extensions.getExtension('cquery-project.cquery');
  const ccls = vscode.extensions.getExtension('ccls-project.ccls');
  if (cquery && cquery.isActive) {
    await vscode.commands.executeCommand('cquery.freshenIndex');
  } else if (ccls && ccls.isActive) {
    await vscode.commands.executeCommand('ccls.reload');
  }
}

function fetchLangConfigs() {
  for (const ext of vscode.extensions.all) {
    const json = ext.packageJSON;
    // All vscode default extensions ids starts with "vscode."
    if (!json.contributes) continue;
    for (const themeData of json.contributes.themes || []) {
      const label = themeData.label as string;
      const fullPath = nodejs.path.join(ext.extensionPath, themeData.path);
      if (!nodejs.fs.existsSync(fullPath)) continue;
      colorThemeFiles[label] = fullPath;
    }
    for (const langData of json.contributes.languages || []) {
      const langId: string = langData.id;
      if (!langData.configuration) {
        continue;
      }
      const langFilePath = nodejs.path.join(
        ext.extensionPath,
        langData.configuration,
      );
      const langConfig = parseJsonFileSync(
        langFilePath,
      ) as vscode.LanguageConfiguration;
      langConfigs[langId] = langConfig;
    }
  }

  // for some reason """ is configured is block comment
  if (langConfigs.python && langConfigs.python.comments) {
    langConfigs.python.comments.blockComment = undefined;
  }

  log.info('Got language configs for', Object.keys(langConfigs));
  log.info('Found color theme files for', Object.keys(colorThemeFiles));
}

/* TODO: move extension parsing to separate file */
const langConfigs: { [id: string]: vscode.LanguageConfiguration } = {};

function activate(_: vscode.ExtensionContext) {
  fetchLangConfigs();
}

Modules.register(activate);
