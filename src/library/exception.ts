import { AsyncFunction, PromiseType } from './templateTypes';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
