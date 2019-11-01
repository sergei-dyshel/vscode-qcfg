'use strict';

import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import { log } from './logging';
import { replaceAll } from './stringUtils';
import { showStatusBarMessage } from './windowUtils';
import { PromiseType } from './tsUtils';

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

export function wrapWithErrorHandlerAsync<
  T extends (...args: any[]) => Promise<any>,
  R
>(
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

export function handleErrors<T extends (...args: any[]) => any>(
  func: T
): (...funcArgs: Parameters<T>) => ReturnType<T> | void {
  return wrapWithErrorHandler(func, stdErrorHandler);
}

export function handleErrorsAsync<T extends (...args: any[]) => Promise<any>>(
  func: T
): (...funcArgs: Parameters<T>) => Promise<PromiseType<ReturnType<T>>> {
  return wrapWithErrorHandlerAsync(func, stdErrorHandler);
}

export function registerCommandWrapped(
  command: string,
  callback: (...args: any[]) => any,
  thisArg?: any
): Disposable {
  return vscode.commands.registerCommand(
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
    textEditor: vscode.TextEditor,
    edit: vscode.TextEditorEdit,
    ...args: any[]
  ) => void,
  thisArg?: any
): Disposable {
  return vscode.commands.registerTextEditorCommand(
    command,
    wrapWithErrorHandler(callback, error =>
      handleErrorDuringCommand(command, error)
    ),
    thisArg
  );
}

export function listenWrapped<T>(
  event: vscode.Event<T>,
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

// private

function simplifyErrorStack(stack: string) {
  const idx = stack.search(/\n\s+at.*extensionHostProcess.js/);
  if (idx !== -1) stack = stack.substr(0, idx);
  const extPath = vscode.extensions.getExtension('QyRoN.vscode-qcfg')!
    .extensionPath;
  return replaceAll(stack, extPath + '/', '');
}

function handleErrorDuringCommand(command: string, error: any) {
  try {
    stdErrorHandler(error, `Command "${command}": `);
  } catch (_) {}
}

function stdErrorHandler(error: any, prefix = ''): never {
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
