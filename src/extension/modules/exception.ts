'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import type {
  TextEditor,
  TextEditorEdit,
  Event,
  ExtensionContext,
} from 'vscode';
import { window, commands, extensions } from 'vscode';

import type { DisposableLike } from '../../library/types';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { replaceAll } from '../../library/stringUtils';
import { showStatusBarMessage } from './windowUtils';
import type {
  PromiseType,
  AsyncFunction,
  AnyFunction,
  VoidFunction,
} from '../../library/templateTypes';
import { Modules } from './module';
import {
  wrapWithErrorHandler,
  wrapWithErrorHandlerAsync,
  CheckError,
} from '../../library/exception';

export function stdErrorHandler(error: any, prefix?: string): never {
  prefix = prefix ?? '';
  if (error instanceof CheckError) {
    log.info(`${prefix}Check failed: ${error.message}`);
    showStatusBarMessage(
      ''.padStart(10, ' ') + error.message + ''.padEnd(10, ' '),
      { errorBackground: true },
    );
  } else if (error instanceof Error) {
    const stack = simplifyErrorStack(error.stack ?? '');
    log.error(`${prefix}${stack}`);
  } else log.error(`${prefix}${String(error)}`);
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
  return wrapWithErrorHandlerAsync(func, createStdErrorHandler(prefix));
}

export function registerAsyncCommandWrapped(
  command: string,
  callback: AsyncFunction,
  thisArg?: any,
): DisposableLike {
  return commands.registerCommand(
    command,
    wrapWithErrorHandlerAsync(callback, (error) => {
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
  return commands.registerCommand(
    command,
    wrapWithErrorHandler(callback, (error) => {
      handleErrorDuringCommand(command, error);
    }),
    thisArg,
  );
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
  listener: (e: T) => void,
  thisArgs?: any,
  disposables?: DisposableLike[],
): DisposableLike {
  return event(
    wrapWithErrorHandler(listener, handleErrorDuringEvent),
    thisArgs,
    disposables,
  );
}

export function listenAsyncWrapped<T>(
  event: Event<T>,
  listener: (e: T) => Promise<void>,
  thisArgs?: any,
  disposables?: DisposableLike[],
): DisposableLike {
  return event(
    wrapWithErrorHandlerAsync(listener, handleErrorDuringEvent),
    thisArgs,
    disposables,
  );
}

/**
 * Evaluate promise and handle async error with @stdErrorHandler
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
  handleAsyncStd(commands.executeCommand(command, ...rest));
}

// private

const extensionPath = nodejs.fs.realpathSync(
  extensions.getExtension('QyRoN.vscode-qcfg')!.extensionPath,
);

function simplifyErrorStack(stack: string) {
  const idx = stack.search(/\n\s+at.*extensionHostProcess.js/);
  if (idx !== -1) stack = stack.substr(0, idx);
  return replaceAll(stack, extensionPath + '/', '');
}

function handleErrorDuringCommand(command: string, error: any) {
  try {
    stdErrorHandler(error, `Command "${command}": `);
  } catch (err: unknown) {
    if (err instanceof CheckError) return;
    const SHOW_OUTPUT = 'Show output panel';
    // eslint-disable-next-line @typescript-eslint/no-floating-promises
    window
      .showErrorMessage(`*${command}*: ${err}`, SHOW_OUTPUT)
      .then((item: string | undefined) => {
        if (SHOW_OUTPUT === item) {
          executeCommandHandled('qcfg.log.show');
        }
      });
  }
}

function createStdErrorHandler(prefix?: string) {
  return (error: any) => stdErrorHandler(error, prefix);
}

function handleErrorDuringEvent(error: any) {
  stdErrorHandler(error, 'Event: ');
}
function activate(_: ExtensionContext) {
  console.info('Extension path: ' + extensionPath);
}

Modules.register(activate);
