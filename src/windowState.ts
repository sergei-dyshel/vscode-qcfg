'use strict';

import { log } from './logging';
import { listenWrapped } from './exception';
import { Modules } from './module';
import { windowManager, Window } from 'node-window-manager';
import { WindowState, ExtensionContext, window } from 'vscode';

export async function focusWindow() {
  if (!windowId) {
    return;
  }
  log.info('Focusing current OS window');
  new Window(windowId).bringToTop();
}

let windowId: number | undefined;

function tryGetActiveWindowId(): number {
  return windowManager.getActiveWindow().id;
}

function windowStateChanged(state: WindowState) {
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.debug(msg);
  if (state.focused && !windowId) {
    windowId = tryGetActiveWindowId();
    log.info(`Current window id: ${windowId}`);
  }
}

function activate(context: ExtensionContext) {
  if (window.state.focused) {
    windowId = tryGetActiveWindowId();
    log.info(`Current window id: ${windowId}`);
  }

  context.subscriptions.push(
    listenWrapped(window.onDidChangeWindowState, windowStateChanged),
  );
}

Modules.register(activate);
