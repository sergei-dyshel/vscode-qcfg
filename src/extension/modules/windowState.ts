'use strict';

import { log } from '../../library/logging';
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

export function shouldSplitVertically(): boolean {
  if (!window.state.focused) return false;
  const bounds = windowManager.getActiveWindow().getBounds();
  const pivotMode = (bounds.height ?? 0) > (bounds.width ?? 0);
  const screenTooSmall = bounds.width !== undefined && bounds.width < 1500;
  return pivotMode || screenTooSmall;
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