import { ExtensionContext, TabInputTextDiff, TextEditor } from 'vscode';
import { commands, Uri, window, workspace } from 'vscode';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { getDocumentRootThrowing } from '../utils/document';
import { PersistentStringQuickPick } from '../utils/quickPickPersistent';
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
  const { workspaceFolder: wsFolder } = getDocumentRootThrowing(
    document.fileName,
  );
  openOrCreateTerminal(wsFolder.name, wsFolder.uri.fsPath);
}

function terminalInFileFolder() {
  const document = getActiveTextEditor().document;
  const relPath = workspace.asRelativePath(document.fileName);
  const name = nodejs.path.dirname(relPath);
  openOrCreateTerminal(name, nodejs.path.dirname(document.fileName));
}

async function runCommand() {
  const allCommands = await commands.getCommands();
  const qp = new PersistentStringQuickPick('qcfg.runCommand', allCommands);
  const cmd = await qp.select();
  if (cmd) {
    log.info(`Running command ${cmd}`);
    try {
      await commands.executeCommand(cmd);
    } finally {
      log.info(`Finished command ${cmd}`);
    }
  }
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
  if (
    window.tabGroups.activeTabGroup.activeTab?.input instanceof TabInputTextDiff
  )
    return;
  const realPath = await fileUtils.realPath(uri.fsPath);
  if (realPath === uri.fsPath) return;
  await window.showTextDocument(Uri.file(realPath), {
    selection: getActiveTextEditor().selection,
  });
}

function checkSpawnTime() {
  const start = Date.now();
  nodejs.child_process.spawn('ls', ['.']);
  log.info(`spawn sync time: ${Date.now() - start}`);
}

function activate(context: ExtensionContext) {
  checkSpawnTime();
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
