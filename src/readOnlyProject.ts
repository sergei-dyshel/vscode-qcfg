'use strict';

import * as vscode from 'vscode';
import {window, workspace} from 'vscode';
import { registerCommandWrapped, listenWrapped } from './exception';
import { Modules } from './module';

const MEMENTO_KEY = 'qcfgIsReadOnly';


let status: vscode.StatusBarItem;
let context: vscode.ExtensionContext;

function getState(): boolean {
  return context.workspaceState.get<boolean>(MEMENTO_KEY, false);
}

function setState(state: boolean) {
  context.workspaceState.update(MEMENTO_KEY, state);
}

function toggle() {
  setState(!getState());
  updateStatus();
}

function updateStatus() {
  if (getState())
    status.show();
  else
    status.hide();
}

function onDidChangeTextDocument(_event) {
  if (!getState())
    return;

  window.showErrorMessage(
      'Current workspace is marked as READ-ONLY', {modal: true});
}

function activate(extContext: vscode.ExtensionContext) {
  context = extContext;
  status = window.createStatusBarItem();
  status.color = 'red';
  status.text = '$(circle-slash)$(circle-slash)$(circle-slash)';
  updateStatus();

  context.subscriptions.push(
      registerCommandWrapped('qcfg.toggleReadOnly', toggle),
      listenWrapped(
          workspace.onDidChangeTextDocument, onDidChangeTextDocument));
}

Modules.register(activate);