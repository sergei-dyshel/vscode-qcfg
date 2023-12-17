import type { ExtensionContext, WindowState } from 'vscode';
import { window } from 'vscode';
import { log } from '../../library/logging';
import { asyncWait } from '../../library/nodeUtils';
import {
  handleAsyncStd,
  listenWrapped,
  registerCommandWrapped,
} from './exception';
import { Modules } from './module';
import { runSubprocessSync } from './subprocess';

// eslint-disable-next-line @typescript-eslint/require-await
async function callHammerspoon(
  funcName: string,
  ...args: Array<number | string>
) {
  const params = args
    .map((x) => {
      if (typeof x === 'number') return x.toString();
      return JSON.stringify(x);
    })
    .join(', ');
  const callExpr = `${funcName}(${params})`;
  // XXX: for some reason calling async makes `hs` command stuck
  return runSubprocessSync(['hs', '-c', callExpr]);
}

export async function focusWindow() {
  if (!windowId) {
    log.warn('Window ID not set yet, can not focus');
    return;
  }
  log.info('Focusing current window');
  await callHammerspoon('ipcFocusWindow', windowId);
  handleAsyncStd(
    asyncWait(
      `window ${windowId} to be focused`,
      100, // intervalMs
      3000, // timeoutMs
      async () => windowId === (await tryGetActiveWindowId()),
    ),
  );
}

/**
 * Whether current window is focused
 */
export function isWindowFocused() {
  return currentState.focused;
}

let windowId: number | undefined;

async function tryGetActiveWindowId() {
  const result = await callHammerspoon('ipcGetWindowId');
  return Number(result.stdout);
}

function windowStateChanged(state: WindowState) {
  currentState = state;
  const msg = state.focused ? 'Focused' : 'Unfocused';
  log.trace(msg);
}

async function getInitialWindowId() {
  if (!window.state.focused) return;
  const newWindowId = await tryGetActiveWindowId();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!window.state.focused) return;
  windowId = newWindowId;
  log.info(`Current window id: ${windowId}`);
}

function activate(context: ExtensionContext) {
  handleAsyncStd(getInitialWindowId());

  context.subscriptions.push(
    listenWrapped(window.onDidChangeWindowState, windowStateChanged),
    registerCommandWrapped('qcfg.window.focus', async () => {
      await focusWindow();
    }),
  );
}

let currentState: WindowState;

Modules.register(activate);
