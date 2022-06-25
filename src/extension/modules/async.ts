'use strict';

import type { ExtensionContext } from 'vscode';
import { assertNotNull } from '../../library/exception';
import { log, Logger } from '../../library/logging';
import type { AsyncFunction, PromiseType } from '../../library/templateTypes';
import { concatArrays, izip, zipArrays } from '../../library/tsUtils';
import { Modules } from './module';

type Callback = () => Promise<void>;
type Resolve = () => void;
type Reject = (err: unknown) => void;

export class PromiseQueue {
  private readonly log: Logger;

  constructor(name: string) {
    this.log = new Logger({
      name: 'PromiseQueue',
      instance: name,
    });
  }

  async add(cb: Callback, name: string): Promise<void> {
    return new Promise((resolve: Resolve, reject: Reject) => {
      /// #if DEBUG
      this.log.trace(`enqueing "${name}"`);
      /// #endif
      this.queue.push({ cb, resolve, reject, name });
      this.runNext();
    });
  }

  queued<T>(
    cb: (arg: T) => Promise<void>,
    name: string,
  ): (arg: T) => Promise<void> {
    return async (arg: T) => this.add(async () => cb(arg), name);
  }

  private runNext() {
    if (this.queue.isEmpty || this.busy) return;
    const entry = this.queue.shift();
    assertNotNull(entry);
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
        (err: unknown) => {
          this.busy = false;
          /// #if DEBUG
          this.log.trace(`failed "${entry.name}"`);
          /// #endif
          entry.reject(err);
          this.runNext();
        },
      );
    } catch (err: unknown) {
      this.busy = false;
      /// #if DEBUG
      this.log.trace(`failed synchronously "${entry.name}"`);
      /// #endif
      entry.reject(err);
      this.runNext();
    }
  }

  private busy = false;

  private readonly queue: Array<{
    cb: Callback;
    resolve: Resolve;
    reject: Reject;
    name: string;
  }> = [];
}

export class PromiseContext<T> {
  constructor() {
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

export async function mapAsync<V, R>(
  arr: readonly V[],
  func: (v: V) => Thenable<R>,
): Promise<R[]> {
  return (sequentialAsyncByDefault ? mapAsyncSequential : mapAsyncParallel)(
    arr,
    func,
  );
}

export async function mapAsyncParallel<V, R>(
  arr: readonly V[],
  func: (v: V) => Thenable<R>,
): Promise<R[]> {
  return Promise.all(arr.map(func));
}

export async function mapAsyncSequential<V, R>(
  arr: readonly V[],
  func: (v: V) => Thenable<R>,
): Promise<R[]> {
  const result: R[] = [];
  for (const v of arr) {
    result.push(await func(v));
  }
  return result;
}

declare global {
  /**
   * Map set keys to values asyncronously and return key -> value map
   */
  interface Set<T> {
    mapAsync: <V>(func: (k: T) => Promise<V>) => Promise<Map<T, V>>;
  }
}

// eslint-disable-next-line @typescript-eslint/unbound-method
Set.prototype.mapAsync = async function <K, V>(
  this: Set<K>,
  func: (k: K) => Promise<V>,
): Promise<Map<K, V>> {
  const keys = Array.from(this.values());
  const values = await mapAsync(keys, func);
  return new Map<K, V>(Array.from(izip(keys, values)));
};

export class MapUndefined {}

/**
 * Special (singleton) return value for functions passed to mapSome* which will
 * skip mapping for specific value.
 */
export const MAP_UNDEFINED = new MapUndefined();

/**
 * Map array through function and filter out those returned {@link MAP_UNDEFINED}.
 * Return array of [value, mapped value] pairs.
 */
export async function mapSomeAsyncAndZip<V, R>(
  arr: readonly V[],
  func: (v: V) => Thenable<R | MapUndefined>,
): Promise<Array<[V, R]>> {
  const results: Array<R | MapUndefined> = await mapAsync(arr, func);
  return zipArrays(arr, results).filter(
    (tuple) => tuple[1] !== MAP_UNDEFINED,
  ) as Array<[V, R]>;
}

/**
 * Map array through function and filter out those returned MAP_UNDEFINED.
 * Return array of mapped values.
 */
export async function mapSomeAsync<V, R>(
  arr: readonly V[],
  func: (v: V) => Promise<R | MapUndefined>,
): Promise<R[]> {
  return (await mapSomeAsyncAndZip(arr, func)).map((pair) => pair[1]);
}

/**
 * Filter array through asynchronous predicate.
 */
export async function filterAsync<T>(
  arr: readonly T[],
  predicate: (v: T) => Promise<boolean>,
): Promise<T[]> {
  return mapSomeAsync<T, T>(arr, async (v: T) =>
    (await predicate(v)) ? v : MAP_UNDEFINED,
  );
}

export async function mapAsyncNoThrowAndZip<V, R>(
  arr: V[],
  func: (v: V) => Promise<R>,
  handler?: (err: unknown, v: V) => R | undefined,
): Promise<Array<[V, R]>> {
  const results: Array<R | undefined> = await mapAsync(arr, async (v: V) => {
    try {
      return await func(v);
    } catch (err: unknown) {
      if (handler) {
        const res = handler(err, v);
        if (!res) return undefined;
        return res;
      }
      return undefined;
    }
  });
  return zipArrays(arr, results).filter(
    (tuple) => tuple[1] !== undefined,
  ) as Array<[V, R]>;
}

export async function mapAsyncNoThrow<V, R>(
  arr: V[],
  func: (v: V) => Promise<R>,
  handler?: (err: unknown, v: V) => R | undefined,
): Promise<R[]> {
  const result = await mapAsyncNoThrowAndZip(arr, func, handler);
  return result.map((pair) => pair[1]);
}

/**
 * Concatenate arrays resolved from given array promises
 */
export async function concatArraysAsync<T>(
  ...promises: Array<Promise<T[]>>
): Promise<T[]> {
  if (promises.length === 0) return [];
  return concatArrays(...(await Promise.all(promises)));
}

/**
 * Create retrying version of async function
 */
export function asyncRetry<T extends AsyncFunction>(
  func: T,
  maxRetries: number,
) {
  return async (...args: Parameters<T>): Promise<PromiseType<ReturnType<T>>> =>
    func(...args).catch((err) => {
      if (maxRetries === 0) return err;
      return asyncRetry(func, maxRetries - 1)(...args);
    });
}

let sequentialAsyncByDefault = false;

function activate(_: ExtensionContext) {
  /// #if DEBUG
  sequentialAsyncByDefault = true;
  /// #endif
  log.infoStr(
    'Async mapping is {} by default',
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    sequentialAsyncByDefault ? 'SEQUENTIAL' : 'PARALLEL',
  );
}

Modules.register(activate);
