import { AsyncFunction, PromiseType } from './templateTypes';
import { formatMessage } from './stringify';

export function assert(
  condition: boolean | undefined | null | object,
  ...args: unknown[]
): asserts condition {
  if (!condition) abort(...args);
}

export function abort(...args: unknown[]): never {
  throw new Error(formatMessage(args, 'Assertion failed'));
}

export function assertNonNull<T>(
  val: T | undefined | null,
  ...args: unknown[]
): T {
  assert(val !== undefined && val !== null, ...args);
  return val;
}

export function assertNull<T>(val: T | undefined | null, ...args: unknown[]) {
  assert(val === undefined || val === null, ...args);
}

export function assertInstanceOf<T extends B, B>(
  value: B,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cls: new (...args: any[]) => T,
  ...args: any[]
): T {
  assert(value instanceof cls, ...args);
  return value;
}

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
 * Throw non-critical exception which results in non-disruptive message in status bar.
 */
export function check(
  condition: boolean | undefined | null | object,
  message: string,
): asserts condition {
  if (!condition) throw new CheckError(message);
}

/**
 * Throw non-critical exception if value is null/undefined
 */
export function checkNonNull<T>(val: T | undefined | null, message: string): T {
  check(val !== undefined && val !== null, message);
  return val;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (error: any) => R,
): (...funcArgs: Parameters<T>) => Promise<PromiseType<ReturnType<T>> | R> | R {
  return (
    ...args: Parameters<T>
  ): Promise<PromiseType<ReturnType<T>> | R> | R => {
    try {
      // eslint-disable-next-line @typescript-eslint/return-await
      return func(...args).catch(exc => handler(exc));
    } catch (exc) {
      return handler(exc);
    }
  };
}
