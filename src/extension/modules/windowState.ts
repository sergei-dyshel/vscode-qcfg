'use strict';

import { log } from '../../library/logging';
import {
  handleAsyncStd,
  listenWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import { windowManager, Window } from 'node-window-manager';
import type { WindowState, ExtensionContext } from 'vscode';
import { window } from 'vscode';
import { runSubprocessSync } from './subprocess';
import { asyncWait } from '../../library/nodeUtils';

function callHammerspoon(funcName: string, ...args: Array<number | string>) {
  const params = args
    .map((x) => {
      if (typeof x === 'number') return x.toString();
      if (typeof x === 'string') return JSON.stringify(x);
      return '';
    })
    .join(', ');
  const callExpr = `${funcName}(${params})`;
  return runSubprocessSync(['hs', '-c', callExpr]);
}

/* XXX: unused */
export function focusWindowHammerspoon() {
  if (!windowId) {
    return;
  }
  log.info('Focusing current OS window');
  callHammerspoon('ipcFocusWindow', windowId);
  if (windowId === tryGetActiveWindowId()) {
    log.warn("Couldn't focus window with Hammerspoon");
  }
}

export function focusWindow() {
  if (!windowId) {
    return;
  }
  const win = new Window(windowId);
  win.show();
  win.bringToTop();
  handleAsyncStd(
    asyncWait(
      `window ${windowId} to be focused`,
      100, // intervalMs
      3000, // timeoutMs
      () => windowId === tryGetActiveWindowId(),
    ),
  );
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
  if (state.focused) {
    const newWindowId = tryGetActiveWindowId();
    if (newWindowId !== windowId) {
      if (!windowId) {
        log.info(`Current window id: ${windowId}`);
      } else {
        log.info(`Current window id changed ${windowId} => ${newWindowId}`);
      }
      windowId = newWindowId;
    }
  }
}

function activate(context: ExtensionContext) {
  if (window.state.focused) {
    windowId = tryGetActiveWindowId();
    log.info(`Current window id: ${windowId}`);
  }

  context.subscriptions.push(
    listenWrapped(window.onDidChangeWindowState, windowStateChanged),
    registerSyncCommandWrapped('qcfg.window.focus', () => {
      focusWindow();
    }),
  );
}

Modules.register(activate);
