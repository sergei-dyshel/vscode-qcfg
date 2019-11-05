'use strict';

import * as vscode from 'vscode';
import * as language from './language';
import * as saveAll from './saveAll';
import { log } from './logging';
import * as subprocess from './subprocess';
import { setTimeoutPromise } from './nodeUtils';
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped
} from './exception';
import { Modules } from './module';

enum State {
  Off,
  On,
  Error
}

let state = State.Off;

let status: vscode.StatusBarItem;

function setStatusBar() {
  let stateStr = '';
  switch (state) {
    case State.On:
      stateStr = 'on';
      status.color = 'yellow';
      break;
    case State.Off:
      stateStr = 'off';
      status.color = undefined;
      break;
    case State.Error:
      stateStr = 'error';
      status.color = 'red';
      break;
  }
  status.text = 'AutoSync: ' + stateStr;
  status.show();
}

function toggle() {
  state = state === State.Off ? State.On : State.Off;
  setStatusBar();
}

async function onSaveAll(docs: saveAll.DocumentsInFolder) {
  if (state === State.Off) return;

  const command = vscode.workspace
    .getConfiguration('qcfg')
    .get<string>('autoSync.command');

  if (!command) return;

  const docPaths = docs.documents.map(doc =>
    vscode.workspace.asRelativePath(doc.fileName, false)
  );
  log.info('Auto syncing ', docPaths, 'in', docs.folder.name);

  const paths = docPaths.join(' ');
  const cmd = command.includes('{}')
    ? command.replace('{}', paths)
    : `${command} ${paths}`;
  log.debug('Running ', cmd);
  try {
    await subprocess.executeSubprocess(cmd, { cwd: docs.folder.uri.fsPath });
    if (state === State.Error) {
      state = State.On;
      setStatusBar();
    }
  } catch (err) {
    const error = err as subprocess.ExecResult;
    if (state !== State.Error) {
      await vscode.window.showErrorMessage(
        `autoSync failed with ${error.code}, ${error.signal} stdout: ${error.stdout} stderr: ${error.stderr}`
      );
      state = State.Error;
      setStatusBar();
    }
    return;
  }
  log.debug('Waiting before sending didSave to clients');
  await setTimeoutPromise(1000);
  for (const doc of docs.documents) language.sendDidSave(doc);
}

function activate(context: vscode.ExtensionContext) {
  status = vscode.window.createStatusBarItem();
  status.command = 'qcfg.autoSync.toggle';

  state = vscode.workspace
    .getConfiguration('qcfg')
    .get('autoSync.enabled', false)
    ? State.On
    : State.Off;
  setStatusBar();
  context.subscriptions.push(
    registerSyncCommandWrapped('qcfg.autoSync.toggle', toggle)
  );
  context.subscriptions.push(saveAll.onEvent(onSaveAll));
}

Modules.register(activate);
