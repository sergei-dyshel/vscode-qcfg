'use strict';

import * as path from 'path';
import type { ExtensionContext } from 'vscode';
import { commands, window, workspace } from 'vscode';
import { selectStringFromListMru } from './dialog';
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from './exception';
import * as fileUtils from './fileUtils';
import { Modules } from './module';
import { executeSubprocess } from './subprocess';
import { getActiveTextEditor } from './utils';

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
  const name = path.dirname(relPath);
  openOrCreateTerminal(name, path.dirname(document.fileName));
}

async function runCommand() {
  const allCommands = await commands.getCommands();
  const cmd = await selectStringFromListMru(allCommands, 'qcfg.runCommand');
  if (cmd) await commands.executeCommand(cmd);
}

async function openInExternalApp() {
  const curFile = getActiveTextEditor().document.fileName;
  return executeSubprocess(['open', curFile]);
}

async function showInFileManager() {
  const curFile = getActiveTextEditor().document.fileName;
  return executeSubprocess(['open', '--reveal', curFile]);
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
    registerAsyncCommandWrapped('qcfg.openInExternalApp', openInExternalApp),
    registerAsyncCommandWrapped('qcfg.showInFileManager', showInFileManager),
  );
}

Modules.register(activate);
