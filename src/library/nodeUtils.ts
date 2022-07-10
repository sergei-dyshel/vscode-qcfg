import * as nodejs from './nodejs';

export const setTimeoutPromise = nodejs.util.promisify(setTimeout);
export const setImmediatePromise = nodejs.util.promisify(setImmediate);
export const setIntervalPromise = nodejs.util.promisify(setInterval);

// TODO: unused
export class Timer {
  setTimeout(ms: number, callback: (...args: any[]) => void, ...args: any[]) {
    this.clear();
    this.type = TimerType.TIMEOUT;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.type = undefined;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      callback(...args);
    }, ms);
  }

  setInterval(callback: (...args: any[]) => void, ms: number, ...args: any[]) {
    this.clear();
    this.type = TimerType.INTERVAL;
    this.timer = setInterval(callback, ms, args);
  }

  clear() {
    if (this.timer)
      if (this.type === TimerType.TIMEOUT) clearTimeout(this.timer);
      else if (this.type === TimerType.INTERVAL) clearInterval(this.timer);
  }

  get isSet() {
    return this.timer !== undefined;
  }

  private timer?: NodeJS.Timer;
  private type?: TimerType;
}

export async function asyncWait(
  waitingFor: string,
  intervalMs: number,
  timeoutMs: number,
  predicate: () => boolean | Promise<boolean>,
) {
  const start = Date.now();
  for (;;) {
    const result = predicate();
    const value = result instanceof Promise ? await result : result;
    if (value) return;
    const now = Date.now();
    if (now - start > timeoutMs)
      throw new Error(`Timeout waiting for ${waitingFor}`);
    await setTimeoutPromise(intervalMs);
  }
}

// private

enum TimerType {
  TIMEOUT,
  INTERVAL,
}
