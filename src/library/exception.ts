import { formatMessage } from "./stringify";
import type { AnyFunction } from "./templateTypes";

export function assert(
  condition: boolean | undefined | null,
  ...args: unknown[]
): asserts condition {
  if (!condition) abort(...args);
}

export function assertNotNull<T>(
  val: T,
  ...args: unknown[]
): asserts val is NonNullable<T> {
  if (val === undefined || val === null) abort(...args);
}

export function abort(...args: unknown[]): never {
  throw new Error(formatMessage(args, "Assertion failed"));
}

export function assertNull<T>(val: T | undefined | null, ...args: unknown[]) {
  assert(val === undefined || val === null, ...args);
}

export function assertInstanceOf<T extends B, B>(
  value: B,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cls: new (..._: any[]) => T,
  ...args: unknown[]
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
    this.name = "CheckError";
  }
}

/**
 * Throw non-critical exception which results in non-disruptive message in
 * status bar.
 */
export function check(condition: boolean, message: string): asserts condition {
  if (!condition) throw new CheckError(message);
}

/**
 * Throw non-critical exception if value is null/undefined
 */
export function checkNotNull<T>(
  val: T,
  message: string,
): asserts val is NonNullable<T> {
  if (val === undefined || val === null) throw new CheckError(message);
}

/**
 * Wrap sync or async function with exception handler (both sync and async
 * exception)
 */
export function wrapWithErrorHandler<T extends AnyFunction, R>(
  func: T,
  handler: (error: unknown) => R,
): (...funcArgs: Parameters<T>) => ReturnType<T> | R {
  return (...args: Parameters<T>) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment
      const result = func(...args);
      if (!(result instanceof Promise)) return result;
      return result.catch((err) => handler(err));
    } catch (err) {
      return handler(err);
    }
  };
}
