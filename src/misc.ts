'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import { selectStringFromListMru } from './dialog';

import * as fileUtils from './fileUtils';
import { getActiveTextEditor } from './utils';
import { window, workspace } from 'vscode';
import { registerCommandWrapped } from './exception';
import { Modules } from './module';

function openOrCreateTerminal(name: string, cwd: string) {
  for (const terminal of window.terminals) {
    if (terminal.name === name) {
      terminal.show();
      return;
    }
  }
  const terminal = window.createTerminal({ name, cwd });
  terminal.show();
}

function terminalInWorkspaceFolder() {
  const document = getActiveTextEditor().document;
  const { workspaceFolder: wsFolder } = fileUtils.getDocumentRootThrowing(
    document.fileName
  );
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
  if (cmd) vscode.commands.executeCommand(cmd);
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    registerCommandWrapped(
      'qcfg.terminal.inWorkspaceFolder',
      terminalInWorkspaceFolder
    ),
    registerCommandWrapped('qcfg.terminal.inFileFolder', terminalInFileFolder),
    registerCommandWrapped('qcfg.runCommand', runCommand)
  );
}

Modules.register(activate);
