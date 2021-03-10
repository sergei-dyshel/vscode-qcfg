'use strict';

import * as saveAll from './saveAll';
import { log } from '../../library/logging';
import * as subprocess from './subprocess';
import { setTimeoutPromise } from '../../library/nodeUtils';
import { registerSyncCommandWrapped } from './exception';
import { Modules } from './module';
import { sendDidSaveToLangClients } from './langClient';
import type { ExtensionContext, StatusBarItem } from 'vscode';
import { ThemeColor, workspace, window } from 'vscode';

import * as nodejs from '../../library/nodejs';
import { exists } from './fileUtils';

enum State {
  OFF,
  ON,
  ERROR,
}

let state = State.OFF;

let status: StatusBarItem;

function setStatusBar() {
  let stateStr = '';
  switch (state) {
    case State.ON:
      stateStr = 'on';
      status.color = 'yellow';
      break;
    case State.OFF:
      stateStr = 'off';
      status.color = undefined;
      break;
    case State.ERROR:
      stateStr = 'error';
      status.color = 'red';
      break;
  }
  status.text = 'AutoSync: ' + stateStr;
  status.backgroundColor = undefined;
  status.show();
}

function toggle() {
  state = state === State.OFF ? State.ON : State.OFF;
  setStatusBar();
}

async function onSaveAll(docs: saveAll.DocumentsInFolder) {
  if (state === State.OFF) return;

  const command = workspace
    .getConfiguration('qcfg')
    .get<string>('autoSync.command');

  if (!command) return;

  let folder = docs.folder.uri.fsPath;
  while (!(await exists(nodejs.path.join(folder, '.syg.json')))) {
    folder = nodejs.path.dirname(folder);
    if (folder === '/') {
      log.debug(`${folder} is not under syg root`);
      return;
    }
  }

  const docPaths = docs.documents.map((doc) =>
    nodejs.path.relative(folder, doc.fileName),
  );
  log.info(`Auto syncing ${docPaths} in ${docs.folder.name} (under ${folder})`);

  const paths = docPaths.join(' ');
  const cmd = command.includes('{}')
    ? command.replace('{}', paths)
    : `${command} ${paths}`;
  log.debug('Running ', cmd);
  try {
    status.backgroundColor = new ThemeColor('statusBarItem.errorBackground');
    status.text += ' (syncing)';
    await subprocess.executeSubprocess(cmd, { cwd: folder });
    if (state === State.ERROR) {
      state = State.ON;
    }
  } catch (err: unknown) {
    const error = err as subprocess.ExecResult;
    if (state !== State.ERROR) {
      await window.showErrorMessage(
        `autoSync failed with ${error.code}, ${error.signal} stdout: ${error.stdout} stderr: ${error.stderr}`,
      );
      state = State.ERROR;
    }
    return;
  } finally {
    setStatusBar();
  }
  if (workspace.getConfiguration().get<boolean>('qcfg.langClient.remote')) {
    log.debug('Waiting before sending didSave to clients');
    await setTimeoutPromise(500);
    for (const doc of docs.documents) sendDidSaveToLangClients(doc);
  }
}

function activate(context: ExtensionContext) {
  status = window.createStatusBarItem();
  status.command = 'qcfg.autoSync.toggle';

  state = workspace
    .getConfiguration('qcfg')
    .get<boolean>('autoSync.enabled', false)
    ? State.ON
    : State.OFF;
  setStatusBar();
  context.subscriptions.push(
    registerSyncCommandWrapped('qcfg.autoSync.toggle', toggle),
  );
  context.subscriptions.push(saveAll.onEvent(onSaveAll));
}

Modules.register(activate);
