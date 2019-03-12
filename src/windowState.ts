'use strict';

import * as vscode from 'vscode';

import * as logging from './logging';

const log = logging.Logger.create('window');

function windowStateChanged(state: vscode.WindowState)
{
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.info(msg);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.window.onDidChangeWindowState(windowStateChanged));
}