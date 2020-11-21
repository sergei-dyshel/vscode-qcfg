'use strict';

import type {
  TextDocumentChangeEvent,
  StatusBarItem,
  ExtensionContext,
} from 'vscode';
import { window, workspace } from 'vscode';
import {
  listenWrapped,
  registerAsyncCommandWrapped,
  handleAsyncStd,
} from './exception';
import { Modules } from './module';

const MEMENTO_KEY = 'qcfgIsReadOnly';

let status: StatusBarItem;
let context: ExtensionContext;

function getState(): boolean {
  return context.workspaceState.get<boolean>(MEMENTO_KEY, false);
}

async function setState(state: boolean) {
  await context.workspaceState.update(MEMENTO_KEY, state);
}

async function toggle() {
  await setState(!getState());
  updateStatus();
}

function updateStatus() {
  if (getState()) status.show();
  else status.hide();
}

function onDidChangeTextDocument(_: TextDocumentChangeEvent) {
  if (!getState()) return;

  handleAsyncStd(
    window.showErrorMessage('Current workspace is marked as READ-ONLY', {
      modal: true,
    }),
  );
}

function activate(extContext: ExtensionContext) {
  context = extContext;
  status = window.createStatusBarItem();
  status.color = 'red';
  status.text = '$(circle-slash)$(circle-slash)$(circle-slash)';
  updateStatus();

  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.toggleReadOnly', toggle),
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
  );
}

Modules.register(activate);
