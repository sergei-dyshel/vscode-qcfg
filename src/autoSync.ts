'use strict';

import * as vscode from 'vscode';
import * as tasks from './tasks';
import * as language from './language';
import * as saveAll from './saveAll';
import * as logging from './logging';

const log = new logging.Logger('autoSync');

let enabled = false;
let status: vscode.StatusBarItem;

function setStatusBar() {
  status.text = 'AutoSync: ' + (enabled ? 'on' : 'off');
  status.show();
}

function toggle() {
  enabled = ! enabled;
  setStatusBar();
}

async function onSave(document: vscode.TextDocument) {
  if (!enabled)
    return;

  const fileName = vscode.workspace.asRelativePath(document.fileName);
  const command =
      vscode.workspace.getConfiguration('qcfg').get('autoSync.command');

  if (!command)
    return;

  console.log('Auto syncing ' + fileName);
  await tasks.runOneTime('autoSync', {command: command + ' ' + fileName});
  language.sendDidSave(document);
}

async function onSaveAll(docs: saveAll.DocumentsInFolder) {
  if (!enabled)
    return;

  const command =
      vscode.workspace.getConfiguration('qcfg').get('autoSync.command');

  if (!command)
    return;

    const docPaths = docs.documents.map(
      (doc) => vscode.workspace.asRelativePath(doc.fileName, false));
  log.info('Auto syncing ', docPaths, 'in', docs.folder.name);

  const cmd = command + ' ' + docPaths.join(' ');
  await tasks.runOneTime('autoSync', {command: cmd});

  setTimeout(() => {
  for (const doc of docs.documents)
      language.sendDidSave(doc);
  }, 300);
}

export function activate(context: vscode.ExtensionContext) {
  status = vscode.window.createStatusBarItem();
  status.command = 'qcfg.autoSync.toggle';

  enabled = vscode.workspace.getConfiguration('qcfg').get('autoSync.enabled');
  setStatusBar();
  context.subscriptions.push(
      vscode.commands.registerCommand('qcfg.autoSync.toggle', toggle));
  // context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(onSave));
  context.subscriptions.push(saveAll.onEvent(onSaveAll));
}