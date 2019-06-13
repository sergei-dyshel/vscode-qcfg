'use strict';

import { Logger } from './logging';

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