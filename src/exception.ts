'use strict';

import {
  Disposable,
  commands,
  TextEditor,
  TextEditorEdit,
  Event,
  extensions
} from 'vscode';
import { log } from './logging';
import { replaceAll } from './stringUtils';
import { showStatusBarMessage } from './windowUtils';
import { PromiseType } from './tsUtils';

// type NotVoid = object | string | boolean | symbol | number | null | undefined;
type AsyncFunction = (...args: any[]) => Promise<any>;
/**
 * NOTE: Must used `undefined` because just using `void` wouldn't work,
 * see https://stackoverflow.com/questions/57951850/is-there-not-promise-type-in-typescipt
 */
type VoidFunction = (...args: any[]) => void | undefined;
type Function = (...args: any[]) => any;

export class CheckError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CheckError';
  }
}

export function wrapWithErrorHandler<T extends (...args: any[]) => any, R>(
  func: T,
  handler: (error: any) => R
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
  handler: (error: any) => R
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

export function handleErrors<T extends Function>(
  func: T
): (...funcArgs: Parameters<T>) => ReturnType<T> | void {
  return wrapWithErrorHandler(func, stdErrorHandler);
}

export function handleErrorsAsync<T extends AsyncFunction>(
  func: T,
  prefix?: string
): (...funcArgs: Parameters<T>) => Promise<PromiseType<ReturnType<T>>> {
  return wrapWithErrorHandlerAsync(func, createStdErrorHandler(prefix));
}

export function registerAsyncCommandWrapped(
  command: string,
  callback: AsyncFunction,
  thisArg?: any
): Disposable {
  return commands.registerCommand(
    command,
    wrapWithErrorHandlerAsync(callback, error =>
      handleErrorDuringCommand(command, error)
    ),
    thisArg
  );
}

export function registerSyncCommandWrapped(
  command: string,
  callback: VoidFunction,
  thisArg?: any
): Disposable {
  return commands.registerCommand(
    command,
    wrapWithErrorHandler(callback, error =>
      handleErrorDuringCommand(command, error)
    ),
    thisArg
  );
}

export function registerTextEditorCommandWrapped(
  command: string,
  callback: (
    textEditor: TextEditor,
    edit: TextEditorEdit,
    ...args: any[]
  ) => void,
  thisArg?: any
): Disposable {
  return commands.registerTextEditorCommand(
    command,
    wrapWithErrorHandler(callback, error =>
      handleErrorDuringCommand(command, error)
    ),
    thisArg
  );
}

export function listenWrapped<T>(
  event: Event<T>,
  listener: (e: T) => any,
  thisArgs?: any,
  disposables?: Disposable[]
): Disposable {
  return event(
    wrapWithErrorHandler(listener, handleErrorDuringEvent),
    thisArgs,
    disposables
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

function simplifyErrorStack(stack: string) {
  const idx = stack.search(/\n\s+at.*extensionHostProcess.js/);
  if (idx !== -1) stack = stack.substr(0, idx);
  const extPath = extensions.getExtension('QyRoN.vscode-qcfg')!.extensionPath;
  return replaceAll(stack, extPath + '/', '');
}

function handleErrorDuringCommand(command: string, error: any) {
  stdErrorHandler(error, `Command "${command}": `);
}

function createStdErrorHandler(prefix?: string) {
  return (error: any) => {
    return stdErrorHandler(error, prefix);
  };
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
  stdErrorHandler(error, `Event: `);
}
