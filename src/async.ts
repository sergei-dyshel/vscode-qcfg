'use strict';
import * as logging from './logging';

const log = new logging.Logger('async');

type Callback = () => Promise<void>;
type Resolve = () => void;
type Reject = (err: any) => void;

export class PromiseQueue {
  constructor(private name: string) {}

  add(cb: Callback, name?: string) : Promise<void> {
    return new Promise((resolve: Resolve, reject: Reject) => {
      this.debug(`enqueing "${name}`);
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

  private debug(...args) {
      log.debug(`PromiseQueue "${(this.name)}":`, ...args);
  }

  private runNext() {
    if (this.queue.length === 0 || this.busy)
      return;
    const entry = log.assertNonNull(this.queue.shift());
    this.debug(`starting "${entry.name}`);
    this.busy = true;
    try {
      entry.cb().then(
          () => {
            this.busy = false;
            this.debug(`finished "${entry.name}"`);
            entry.resolve();
            this.runNext();
          },
          (err: any) => {
            this.busy = false;
            this.debug(`failed "${entry.name}"`);
            entry.reject(err);
            this.runNext();
          });
    }
    catch (err) {
      this.busy = false;
      this.debug(`failed synchronously "${entry.name}"`);
      entry.reject(err);
      this.runNext();
    }
  }

  private busy = false;

  private queue:
      Array<{cb: Callback, resolve: Resolve, reject: Reject, name?: string}> =
          [];
}