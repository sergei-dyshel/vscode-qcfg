'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import {selectStringFromListMru} from './dialog';

import * as fileUtils from './fileUtils';
import {getActiveTextEditor} from './utils';
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
  const document = getActiveTextEditor().document;
  const {workspaceFolder: wsFolder} = fileUtils.getDocumentRootThrowing(document);
  openOrCreateTerminal(wsFolder.name, wsFolder.uri.fsPath);
}

function terminalInFileFolder() {
  const document = getActiveTextEditor().document;
  const relPath = workspace.asRelativePath(document.fileName);
  const name = path.dirname(relPath) || 'root';
  openOrCreateTerminal(name, path.dirname(document.fileName));
}

async function runCommand() {
  const commands = await vscode.commands.getCommands();
  const cmd = await selectStringFromListMru(commands, 'qcfg.runCommand');
  if (cmd)
    vscode.commands.executeCommand(cmd);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      commands.registerCommand(
          'qcfg.terminal.inWorkspaceFolder', terminalInWorkspaceFolder),
      commands.registerCommand(
          'qcfg.terminal.inFileFolder', terminalInFileFolder),
      commands.registerCommand('qcfg.runCommand', runCommand));
}
