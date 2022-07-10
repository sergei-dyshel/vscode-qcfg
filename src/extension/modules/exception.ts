/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  Event,
  ExtensionContext,
  TextEditor,
  TextEditorEdit,
} from 'vscode';
import { commands, extensions, window } from 'vscode';
import type { DisposableLike } from '../../library/disposable';
import { CheckError, wrapWithErrorHandler } from '../../library/exception';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { replaceAll } from '../../library/stringUtils';
import type {
  AnyFunction,
  AsyncFunction,
  PromiseType,
  VoidFunction,
} from '../../library/templateTypes';
import { Modules } from './module';
import { showNotificationMessage } from './notificationMessage';

let errorMessagesEnabled = true;

export interface StdErrorHandlerOptions {
  /** Show error message despite being temporarily disabled */
  alwaysShowMessage: boolean;
}

export function stdErrorHandler(
  error: any,
  prefix?: string,
  options?: StdErrorHandlerOptions,
): never {
  if (error instanceof CheckError) {
    log.info(`${prefix}Check failed: ${error.message}`);
    showNotificationMessage(error.message);
  } else {
    log.error(`${prefix}${String(error)}`);
    console.error(error);
    if (error instanceof Error) {
      const stack = simplifyErrorStack(error.stack ?? '');
      log.error(stack);
    } else if (typeof error === 'object' && 'stack' in error) {
      const stack = simplifyErrorStack(String(error.stack ?? ''));
      log.error(stack);
    }
    if (errorMessagesEnabled || options?.alwaysShowMessage) {
      const SHOW_OUTPUT = 'Show output panel';
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      window
        .showErrorMessage(`${prefix}${error}`, SHOW_OUTPUT)
        .then((item: string | undefined) => {
          if (SHOW_OUTPUT === item) {
            // avoid circular dependency
            executeCommandHandled('qcfg.log.show');
          }
        });
    }
  }
  throw error;
}

/**
 * Takes sync function and returns it where exceptions are handled
 */
export function handleErrors<T extends AnyFunction>(
  func: T,
): (...funcArgs: Parameters<T>) => ReturnType<T> {
  return wrapWithErrorHandler(func, stdErrorHandler);
}

/**
 * Takes async function and returns it where sync/async exceptions are standardly handled.
 *
 * `error` - error message prefix
 */
export function handleErrorsAsync<T extends AsyncFunction>(
  func: T,
  prefix?: string,
): (...funcArgs: Parameters<T>) => Promise<PromiseType<ReturnType<T>>> {
  return wrapWithErrorHandler(func, createStdErrorHandler(prefix));
}

export function registerAsyncCommandWrapped(
  command: string,
  callback: AsyncFunction,
  thisArg?: any,
): DisposableLike {
  return registerCommandWrapped(command, callback, thisArg);
}

export function registerCommandWrapped(
  command: string,
  callback: (...args: any[]) => void | Promise<void>,
  thisArg?: any,
): DisposableLike {
  return commands.registerCommand(
    command,
    wrapWithErrorHandler(callback, (error) => {
      handleErrorDuringCommand(command, error);
    }),
    thisArg,
  );
}

export function registerSyncCommandWrapped(
  command: string,
  callback: VoidFunction,
  thisArg?: any,
): DisposableLike {
  return registerCommandWrapped(command, callback, thisArg);
}

export function registerTextEditorCommandWrapped(
  command: string,
  callback: (
    textEditor: TextEditor,
    edit: TextEditorEdit,
    ...args: any[]
  ) => void,
  thisArg?: any,
): DisposableLike {
  return commands.registerTextEditorCommand(
    command,
    wrapWithErrorHandler(callback, (error) => {
      handleErrorDuringCommand(command, error);
    }),
    thisArg,
  );
}

export function listenWrapped<T>(
  event: Event<T>,
  listener: (e: T) => void | Promise<void>,
): DisposableLike {
  return event(wrapWithErrorHandler(listener, handleErrorDuringEvent));
}

export function listenAsyncWrapped<T>(
  event: Event<T>,
  listener: (e: T) => Promise<void>,
): DisposableLike {
  return listenWrapped(event, listener);
}

/**
 * Evaluate promise and handle async error with {@link stdErrorHandler}
 */
export function handleAsyncStd<T>(promise: Thenable<T>): void {
  promise.then(undefined, (err) => {
    stdErrorHandler(err);
  });
}

/**
 * Call async function and handle sync/async errors
 */
export function handleStd(func: () => Promise<void>): void {
  try {
    handleAsyncStd(func());
  } catch (err: unknown) {
    stdErrorHandler(err);
  }
}

/**
 * Execute command and handle errors with standardly
 */
export function executeCommandHandled(command: string, ...rest: any[]) {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  handleAsyncStd(commands.executeCommand(command, ...rest));
}

// private

const extensionPath = nodejs.fs.realpathSync(
  extensions.getExtension('QyRoN.vscode-qcfg')!.extensionPath,
);

function simplifyErrorStack(stack: string) {
  const idx = stack.search(/\n\s+at.*extensionHostProcess.js/);
  if (idx !== -1) stack = stack.slice(0, Math.max(0, idx));
  return replaceAll(stack, extensionPath + '/', '');
}

function handleErrorDuringCommand(command: string, error: any) {
  try {
    stdErrorHandler(error, `Command "${command}": `, {
      alwaysShowMessage: true,
    });
  } catch {
    // prevent vscode showing error popup again
  }
}

function createStdErrorHandler(prefix?: string) {
  return (error: any) => stdErrorHandler(error, prefix);
}

function handleErrorDuringEvent(error: any) {
  stdErrorHandler(error, 'Event: ');
}

async function toggleErrorMessages() {
  errorMessagesEnabled = !errorMessagesEnabled;
  const text = errorMessagesEnabled ? 'ENABLED' : 'DISABLED';
  return window.showInformationMessage('qcfg: Error messages ' + text);
}

function activate(context: ExtensionContext) {
  console.info('Extension path: ' + extensionPath);
  context.subscriptions.push(
    registerAsyncCommandWrapped(
      'qcfg.errors.toggleMessages',
      toggleErrorMessages,
    ),
  );
}

Modules.register(activate);
