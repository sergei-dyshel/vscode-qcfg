'use strict';

import * as vscode from 'vscode';
import { log } from './logging';
import { listenWrapped } from './exception';
import { Modules } from './module';

function windowStateChanged(state: vscode.WindowState)
{
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.debug(msg);
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(vscode.window.onDidChangeWindowState, windowStateChanged));
}

Modules.register(activate);