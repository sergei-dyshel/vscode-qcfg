import type { ExtensionContext, Progress } from 'vscode';
import { commands, ProgressLocation, window } from 'vscode';
import type { DisposableLike } from '../../library/disposable';
import { setTimeoutPromise } from '../../library/nodeUtils';
import { getConfiguration } from '../utils/configuration';
import { Modules } from './module';

/**
 * Show notification banner which will be dismissed manually or by timer.
 *
 * @param text Notification message text. No icons ( $(...) ) or newlines are allowed.
 *
 * @param timeoutMs Timeout in milliseconds to dismiss the message.
 * If missing, will use config `qcfg.notification.timeoutMs`.
 * If `0` will show until manually cancelled (with {@link NotificationMessage.cancel}).
 *
 * @returns Object of type {@link NotificationMessage} which can be used to modify or cancel the notification.
 */
export function showNotificationMessage(text: string, timeoutMs?: number) {
  return new NotificationMessage(text, timeoutMs);
}

export class NotificationMessage implements DisposableLike {
  constructor(text: string, timeoutMs?: number) {
    this.cancelPromise = new Promise((resolve, _reject) => {
      this.resolveCancel = resolve;
    });

    const promises = [this.cancelPromise];
    if (timeoutMs === undefined)
      timeoutMs = getConfiguration().getNotNull('qcfg.notification.timeoutMs');
    if (timeoutMs !== 0) promises.push(setTimeoutPromise(timeoutMs));

    this.promise = window.withProgress(
      {
        location: ProgressLocation.Notification,
      },
      async (progress, _token) => {
        this.progress = progress;
        this.progress.report({ message: text, increment: 99.9 });
        await Promise.race(promises);
        this.progress.report({ increment: 100 });
      },
    );
  }

  async wait() {
    return this.promise;
  }

  cancel() {
    this.resolveCancel();
  }

  dispose() {
    this.cancel();
  }

  private readonly promise: Thenable<void>;
  private resolveCancel!: () => void;
  private readonly cancelPromise: Promise<void>;
  private progress!: Progress<{
    message?: string | undefined;
    increment?: number | undefined;
  }>;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand('qcfg.notification.demo', () => {
      showNotificationMessage('Demo message');
    }),
  );
}

Modules.register(activate);
