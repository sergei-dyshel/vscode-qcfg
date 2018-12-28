'use strict';

import * as vscode from 'vscode';
import * as path from 'path';

import * as fileUtils from './fileUtils';
import {window, workspace, commands} from 'vscode';

function openOrCreateTerminal(name: string, cwd: string) {
  for (const terminal of window.terminals) {
    if (terminal.name === name) {
      terminal.show();
      return;
    }
  }
  const terminal = window.createTerminal({name, cwd});
  terminal.show();
}

function terminalInWorkspaceFolder() {
  const document = window.activeTextEditor.document;
  const {wsFolder} = fileUtils.getDocumentRoot(document);
  openOrCreateTerminal(wsFolder.name, wsFolder.uri.fsPath);
}

function terminalInFileFolder() {
  const document = window.activeTextEditor.document;
  const relPath = workspace.asRelativePath(document.fileName);
  const name = path.dirname(relPath) || 'root';
  openOrCreateTerminal(name, path.dirname(document.fileName));
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      commands.registerCommand(
          'qcfg.terminal.inWorkspaceFolder', terminalInWorkspaceFolder),
      commands.registerCommand(
          'qcfg.terminal.inFileFolder', terminalInFileFolder));
}
