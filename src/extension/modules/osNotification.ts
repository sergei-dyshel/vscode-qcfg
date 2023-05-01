import type { ExtensionContext } from 'vscode';
import { handleAsyncStd, registerCommandWrapped } from './exception';
import { Modules } from './module';
import { executeSubprocess } from './subprocess';
import { focusWindow, isWindowFocused } from './windowState';
import { getWorkspaceName } from './workspaceHistory';

const DEFAULT_TIMEOUT_SEC = 5;

interface MacOsNotificationOptions {
  title?: string;
  subtitle?: string;
  timeoutSec?: number;
}

/** Type of action that happens on MacOs notification */
export enum MacOsNotificationAction {
  /** Notification timed out {@link MacOsNotificationOptions.timeoutSec} */
  TIMEOUT = 'timeout',
  /** Notification dismissed or closed (by clicking close action) */
  CLOSED = 'closed',
  /** User clicked anywhere on notification banner */
  CONTENTS_CLICKED = 'contentsClicked',
  /** User clicked *Show* action */
  SHOW_CLICKED = 'showClicked',
}

/**
 * Show notification on MacOs using `alerter` program
 *
 * `alerter` must be configured to show *Alerts*, not *Banners* in System Preferences
 *
 * When using actions *alerter* will still add `Show` action, clicking on which will crash.
 */
async function showMacOsNotification(
  message: string,
  options?: MacOsNotificationOptions,
): Promise<MacOsNotificationAction>;

async function showMacOsNotification<A extends string>(
  message: string,
  options?: MacOsNotificationOptions & { actions: A[] },
): Promise<MacOsNotificationAction | A>;

async function showMacOsNotification<A extends string>(
  message: string,
  options?: MacOsNotificationOptions & { actions?: A[] },
): Promise<MacOsNotificationAction | A> {
  const cmd = [
    'alerter',
    '-json',
    '-sender',
    'com.visualstudio.code.oss',
    '-message',
    message,
    '-timeout',
    (options?.timeoutSec ?? DEFAULT_TIMEOUT_SEC).toString(),
  ];
  if (options?.title) cmd.push('-title', options.title);
  if (options?.subtitle) cmd.push('-subtitle', options.subtitle);
  const res = await executeSubprocess(cmd);
  const resJson = JSON.parse(res.stdout) as {
    activationType: MacOsNotificationAction | 'actionClicked';
    activationValue?: string;
  };
  if (resJson.activationType === 'actionClicked') {
    if (resJson.activationValue !== '') return resJson.activationValue! as A;
    return MacOsNotificationAction.SHOW_CLICKED;
  }
  return resJson.activationType;
}

export interface OsNotificationOptions
  extends Omit<MacOsNotificationOptions, 'title' | 'subtitle'> {
  /** Only show when not focused */
  unfocusedOnly?: boolean;
}

/**
 * Show OS notification.
 *
 * When user clicks on notification focus the window.
 */
export function showOsNotification(
  message: string,
  options?: OsNotificationOptions,
) {
  handleAsyncStd(showOsNotificationAsync(message, options));
}

async function showOsNotificationAsync(
  message: string,
  options?: OsNotificationOptions,
) {
  if (options?.unfocusedOnly && isWindowFocused()) return;
  const action = await showMacOsNotification(message, {
    title: getWorkspaceName() ?? '',
    ...options,
  });
  if (
    action === MacOsNotificationAction.CONTENTS_CLICKED ||
    action === MacOsNotificationAction.SHOW_CLICKED
  ) {
    await focusWindow();
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerCommandWrapped('qcfg.test.osNotification', () => {
      showOsNotification('second line', {
        timeoutSec: 0,
      });
    }),
  );
}

Modules.register(activate);
