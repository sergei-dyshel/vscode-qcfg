'use strict';

import * as vscode from 'vscode';
import {window, workspace, commands} from 'vscode';

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

function onDidChangeTextDocument(event) {
  if (!getState())
    return;

  window.showErrorMessage(
      'Current workspace is marked as READ-ONLY', {modal: true});
}

export function activate(extContext: vscode.ExtensionContext) {
  context = extContext;
  status = window.createStatusBarItem();
  status.color = 'red';
  status.text = '$(circle-slash)$(circle-slash)$(circle-slash)';
  updateStatus();

  context.subscriptions.push(
      commands.registerCommand('qcfg.toggleReadOnly', toggle),
      workspace.onDidChangeTextDocument(onDidChangeTextDocument));
}