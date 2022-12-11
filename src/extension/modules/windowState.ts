import { Window, windowManager } from 'node-window-manager';
import type { ExtensionContext, WindowState } from 'vscode';
import { window } from 'vscode';
import { log } from '../../library/logging';
import { asyncWait } from '../../library/nodeUtils';
import { ConfigSectionWatcher } from './configWatcher';
import {
  handleAsyncStd,
  listenWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import { runSubprocessSync } from './subprocess';

const focusMethod = new ConfigSectionWatcher('qcfg.focus.method');

function callHammerspoon(funcName: string, ...args: Array<number | string>) {
  const params = args
    .map((x) => {
      if (typeof x === 'number') return x.toString();
      return JSON.stringify(x);
    })
    .join(', ');
  const callExpr = `${funcName}(${params})`;
  return runSubprocessSync(['hs', '-c', callExpr]);
}

export function focusWindow() {
  if (!windowId) {
    log.warn('Window ID not set yet, can not focus');
    return;
  }
  log.info('Focusing current window');
  if (focusMethod.value === 'hammerspoon') {
    callHammerspoon('ipcFocusWindow', windowId);
  } else if (focusMethod.value === 'window-manager') {
    // this method works worse than hammerspoon since it:
    // 1. requires accessibility granted to Code, Code Helper etc.
    // 2. focuses all windows (on all monitors) instead of only single window
    const win = new Window(windowId);
    windowManager.requestAccessibility();
    win.show();
    win.bringToTop();
  }
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

/**
 * Whether current window is focused
 */
export function isWindowFocused() {
  return currentState.focused;
}

let windowId: number | undefined;

function tryGetActiveWindowId(): number {
  return windowManager.getActiveWindow().id;
}

function windowStateChanged(state: WindowState) {
  currentState = state;
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.trace(msg);
  if (state.focused) {
    const newWindowId = tryGetActiveWindowId();
    if (newWindowId !== windowId) {
      if (!windowId) {
        log.info(`Current window id: ${newWindowId}`);
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
    if (windowId) log.info(`Current window id: ${windowId}`);
  }

  context.subscriptions.push(
    focusMethod.register(),
    listenWrapped(window.onDidChangeWindowState, windowStateChanged),
    registerSyncCommandWrapped('qcfg.window.focus', () => {
      focusWindow();
    }),
  );
}

let currentState: WindowState;

Modules.register(activate);
