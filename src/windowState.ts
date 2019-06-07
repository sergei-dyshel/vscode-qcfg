'use strict';

import * as vscode from 'vscode';
import { log } from './logging';

function windowStateChanged(state: vscode.WindowState)
{
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.debug(msg);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.window.onDidChangeWindowState(windowStateChanged));
}