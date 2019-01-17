'use strict';

import * as vscode from 'vscode';

import * as logging from './logging';

const log = new logging.Logger('window');

function windowStateChanged(state: vscode.WindowState)
{
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.info(msg);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.window.onDidChangeWindowState(windowStateChanged));
}