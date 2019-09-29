'use strict';

import { Logger, log } from './logging';
import { zipArrays } from './tsUtils';
import { ExtensionContext } from 'vscode';
import { Modules } from './module';

type Callback = () => Promise<void>;
type Resolve = () => void;
type Reject = (err: any) => void;

export class PromiseQueue {
  private log: Logger;
  constructor(name: string) {
    this.log =
        new Logger({name: 'PromiseQueue', instance: name, level: 'debug'});
  }

  add(cb: Callback, name?: string) : Promise<void> {
    return new Promise((resolve: Resolve, reject: Reject) => {
      /// #if DEBUG
      this.log.trace(`enqueing "${name}`);
      /// #endif
      this.queue.push({cb, resolve, reject, name});
      this.runNext();
    });
  }

  queued<T>(cb: (arg: T) => Promise<void>, name?: string):
      (arg: T) => Promise<void> {
    return (arg: T) => {
      return this.add(() => cb(arg), name);
    };
  }

  private runNext() {
    if (this.queue.length === 0 || this.busy)
      return;
    const entry = this.log.assertNonNull(this.queue.shift());
    /// #if DEBUG
    this.log.trace(`starting "${entry.name}`);
    /// #endif
    this.busy = true;
    try {
      entry.cb().then(
          () => {
            this.busy = false;
            /// #if DEBUG
            this.log.trace(`finished "${entry.name}"`);
            /// #endif
            entry.resolve();
            this.runNext();
          },
          (err: any) => {
            this.busy = false;
            /// #if DEBUG
            this.log.trace(`failed "${entry.name}"`);
            /// #endif
            entry.reject(err);
            this.runNext();
          });
    }
    catch (err) {
      this.busy = false;
      /// #if DEBUG
      this.log.trace(`failed synchronously "${entry.name}"`);
      /// #endif
      entry.reject(err);
      this.runNext();
    }
  }

  private busy = false;

  private queue:
      Array<{cb: Callback, resolve: Resolve, reject: Reject, name?: string}> =
          [];
}

export class PromiseContext<T> {
  constructor () {
    // required by "strictPropertyInitialization"
    this.resolve = (_) => {};
    this.reject = (_) => {};

    this.promise = new Promise<T>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }
  readonly promise: Promise<T>;
  resolve: (result: T) => void;
  reject: (err: Error) => void;
}

export function mapAsync<V, R>(
    arr: V[], func: (v: V) => Promise<R>): Promise<R[]> {
  return (sequentialAsyncByDefault ? mapAsyncSequential : mapAsyncParallel)(
      arr, func);
}

export function mapAsyncParallel<V, R>(
    arr: V[], func: (v: V) => Promise<R>): Promise<R[]> {
  return Promise.all(arr.map(func));
}

export async function mapAsyncSequential<V, R>(
    arr: V[], func: (v: V) => Promise<R>): Promise<R[]> {
  const result: R[] = [];
  for (const v of arr) {
    result.push(await func(v));
  }
  return result;
}

export async function mapAsyncNoThrow<V, R>(
    arr: V[], func: (v: V) => Promise<R>,
    handler?: (err: any, v: V) => R | void|undefined): Promise<Array<[V, R]>> {
  const results: Array<R|undefined> = await mapAsync(arr, async (v: V) => {
    try {
      return await func(v);
    } catch (err) {
      if (handler) {
        const res = handler(v, err);
        if (!res)
          return undefined;
        return res;
      }
      return undefined;
    }
  });
  return zipArrays(arr, results).filter(tuple => {
    return tuple[1] !== undefined;
  }) as Array<[V, R]>;
}

let sequentialAsyncByDefault = false;

function activate(_: ExtensionContext) {
  /// #if DEBUG
  sequentialAsyncByDefault = true;
  /// #endif
  log.infoStr(
      'Async mapping is {} by default',
      sequentialAsyncByDefault ? 'sequential' : 'parallel');
}

Modules.register(activate)