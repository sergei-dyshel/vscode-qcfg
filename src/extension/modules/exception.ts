'use strict';

/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  Disposable,
  commands,
  TextEditor,
  TextEditorEdit,
  Event,
  extensions,
  ExtensionContext,
} from 'vscode';
import { log } from './logging';
import * as nodejs from '../../library/nodejs';
import { replaceAll } from '../../library/stringUtils';
import { showStatusBarMessage } from './windowUtils';
import {
  PromiseType,
  AsyncFunction,
  AnyFunction,
  VoidFunction,
} from '../../library/templateTypes';
import { Modules } from './module';

/**
 * Non-critical exception meant to show message to user
 */
export class CheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckError';
  }
}

/**
 * Throw non-critical exception if value is null/undefined
 */
export function checkNonNull<T>(val: T | undefined | null, message: string): T {
  if (val === undefined || val === null) throw new CheckError(message);
  return val as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function wrapWithErrorHandler<T extends (...args: any[]) => any, R>(
  func: T,
  handler: (error: unknown) => R,
): (...funcArgs: Parameters<T>) => ReturnType<T> | R {
  return (...args: Parameters<T>): ReturnType<T> | R => {
    try {
      return func(...args);
    } catch (exc) {
      return handler(exc);
    }
  };
}

export function wrapWithErrorHandlerAsync<T extends AsyncFunction, R>(
  func: T,
  handler: (error: any) => R,
): (...funcArgs: Parameters<T>) => Promise<PromiseType<ReturnType<T>> | R> | R {
  return (
    ...args: Parameters<T>
  ): Promise<PromiseType<ReturnType<T>> | R> | R => {
    try {
      return func(...args).catch(exc => handler(exc));
    } catch (exc) {
      return handler(exc);
    }
  };
}

export function handleErrors<T extends AnyFunction>(
  func: T,
): (...funcArgs: Parameters<T>) => ReturnType<T> | void {
  return wrapWithErrorHandler(func, stdErrorHandler);
}

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
): Disposable {
  return commands.registerCommand(
    command,
    wrapWithErrorHandlerAsync(callback, error =>
      handleErrorDuringCommand(command, error),
    ),
    thisArg,
  );
}

export function registerSyncCommandWrapped(
  command: string,
  callback: VoidFunction,
  thisArg?: any,
): Disposable {
  return commands.registerCommand(
    command,
    wrapWithErrorHandler(callback, error =>
      handleErrorDuringCommand(command, error),
    ),
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
): Disposable {
  return commands.registerTextEditorCommand(
    command,
    wrapWithErrorHandler(callback, error =>
      handleErrorDuringCommand(command, error),
    ),
    thisArg,
  );
}

export function listenWrapped<T>(
  event: Event<T>,
  listener: (e: T) => any,
  thisArgs?: any,
  disposables?: Disposable[],
): Disposable {
  return event(
    wrapWithErrorHandler(listener, handleErrorDuringEvent),
    thisArgs,
    disposables,
  );
}

/**
 * Evaluate promise and handle async error with @stdErrorHandler
 */
export function handleAsyncStd<T>(promise: Thenable<T>): void {
  promise.then(undefined, err => {
    stdErrorHandler(err);
  });
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
  stdErrorHandler(error, `Command "${command}": `);
}

function createStdErrorHandler(prefix?: string) {
  return (error: any) => stdErrorHandler(error, prefix);
}

function stdErrorHandler(error: any, prefix?: string): never {
  prefix = prefix || '';
  if (error instanceof CheckError) {
    log.info(`${prefix}Check failed: ${error.message}`);
    showStatusBarMessage(error.message, { color: 'red' });
  } else if (error instanceof Error) {
    const stack = simplifyErrorStack(error.stack || '');
    log.error(`${prefix}${stack}`);
  } else log.error(`${prefix}${String(error)}`);
  throw error;
}

function handleErrorDuringEvent(error: any) {
  stdErrorHandler(error, 'Event: ');
}
function activate(_: ExtensionContext) {
  console.info('Extension path: ' + extensionPath);
}

Modules.register(activate);
