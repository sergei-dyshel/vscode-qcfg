'use strict';

import * as vscode from 'vscode';
import * as language from './language';
import * as saveAll from './saveAll';
import { log } from './logging';
import * as subprocess from './subprocess';
import {setTimeoutPromise} from './nodeUtils';
import { registerCommandWrapped } from './exception';

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

async function onSaveAll(docs: saveAll.DocumentsInFolder) {
  if (!enabled)
    return;

  const command =
      vscode.workspace.getConfiguration('qcfg').get<string>('autoSync.command');

  if (!command)
    return;

    const docPaths = docs.documents.map(
      (doc) => vscode.workspace.asRelativePath(doc.fileName, false));
  log.info('Auto syncing ', docPaths, 'in', docs.folder.name);

  const paths = docPaths.join(' ');
  const cmd = command.includes('{}') ? command.replace('{}', paths) :
                                       command + ' ' + paths;
  try {
    await subprocess.exec(cmd, {cwd: docs.folder.uri.fsPath});
  }
  catch (err) {
    const error = err as subprocess.ExecResult;
    vscode.window.showErrorMessage(`autoSync failed with ${error.code}, ${
        error.signal} stdout: ${error.stdout} stderr: ${error.stderr}`);
  }
  log.debug('Waiting before sending didSave to clients');
  await setTimeoutPromise(1000);
  for (const doc of docs.documents)
      language.sendDidSave(doc);
}

export function activate(context: vscode.ExtensionContext) {
  status = vscode.window.createStatusBarItem();
  status.command = 'qcfg.autoSync.toggle';

  enabled =
      vscode.workspace.getConfiguration('qcfg').get('autoSync.enabled', false);
  setStatusBar();
  context.subscriptions.push(
      registerCommandWrapped('qcfg.autoSync.toggle', toggle));
  context.subscriptions.push(saveAll.onEvent(onSaveAll));
}