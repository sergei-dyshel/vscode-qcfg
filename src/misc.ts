'use strict';

import * as path from 'path';
import { selectStringFromListMru } from './dialog';

import * as fileUtils from './fileUtils';
import { getActiveTextEditor } from './utils';
import { window, workspace, commands, ExtensionContext } from 'vscode';
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';

function openOrCreateTerminal(name: string, cwd: string) {
  for (const term of window.terminals) {
    if (term.name === name) {
      term.show();
      return;
    }
  }
  const terminal = window.createTerminal({ name, cwd });
  terminal.show();
}

function terminalInWorkspaceFolder() {
  const document = getActiveTextEditor().document;
  const { workspaceFolder: wsFolder } = fileUtils.getDocumentRootThrowing(
    document.fileName,
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
  const allCommands = await commands.getCommands();
  const cmd = await selectStringFromListMru(allCommands, 'qcfg.runCommand');
  if (cmd) await commands.executeCommand(cmd);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerSyncCommandWrapped(
      'qcfg.terminal.inWorkspaceFolder',
      terminalInWorkspaceFolder,
    ),
    registerSyncCommandWrapped(
      'qcfg.terminal.inFileFolder',
      terminalInFileFolder,
    ),
    registerAsyncCommandWrapped('qcfg.runCommand', runCommand),
  );
}

Modules.register(activate);
