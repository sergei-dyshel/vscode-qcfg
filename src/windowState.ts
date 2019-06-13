'use strict';

import * as vscode from 'vscode';
import { log } from './logging';
import { listenWrapped } from './exception';

function windowStateChanged(state: vscode.WindowState)
{
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.debug(msg);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(vscode.window.onDidChangeWindowState, windowStateChanged));
}