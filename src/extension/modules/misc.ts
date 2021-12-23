'use strict';

import * as path from 'path';
import {
  commands,
  ExtensionContext,
  TextEditor,
  Uri,
  window,
  workspace,
} from 'vscode';
import { selectStringFromListMru } from './dialog';
import {
  listenAsyncWrapped,
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

async function openRealPath() {
  const editor = getActiveTextEditor();
  const realPath = await fileUtils.realPath(editor.document.fileName);
  await window.showTextDocument(Uri.file(realPath), {
    selection: editor.selection,
  });
}

async function autoOpenRealPath(editor: TextEditor | undefined) {
  if (!editor) return;
  const uri = editor.document.uri;
  if (uri.scheme !== 'file') return;
  const realPath = await fileUtils.realPath(uri.fsPath);
  if (realPath === uri.fsPath) return;
  await window.showTextDocument(Uri.file(realPath), {
    selection: getActiveTextEditor().selection,
  });
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
    listenAsyncWrapped(window.onDidChangeActiveTextEditor, autoOpenRealPath),
    registerAsyncCommandWrapped('qcfg.runCommand', runCommand),
    registerAsyncCommandWrapped('qcfg.openInExternalApp', openInExternalApp),
    registerAsyncCommandWrapped('qcfg.showInFileManager', showInFileManager),
    registerAsyncCommandWrapped('qcfg.openRealPath', openRealPath),
  );
}

Modules.register(activate);
