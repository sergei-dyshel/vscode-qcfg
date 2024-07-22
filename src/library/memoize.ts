/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { DefaultMapAdapter } from "./map";

/**
 * Memoize values returned by function.
 *
 * NOTE: function arguments must be JSON-stringifiable for this to work
 */
export function memoize<V, F extends (...args: any[]) => V>(func: F): F;

export function memoize<V>(func: (...args: any[]) => V) {
  const cache = new DefaultMapAdapter<any[], V, string>(
    JSON.stringify,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    (args) => func(...args),
  );
  return (...args: any[]) => cache.get(args);
}

export function memoizeWithExc<E, V, F extends (...args: any[]) => V>(
  exc: new () => E,
  func: F,
): F;

/**
 * Like {@link memoize} but also remembers thrown exceptions of given type.
 *
 * If memoized function threw exception for certain combination of arguments,
 * next time it's called with these arguments the saved exception will be thrown
 * automatically.
 */
export function memoizeWithExc<E, V>(
  exc: new () => E,
  func: (...args: any[]) => V,
) {
  const cache = new DefaultMapAdapter<any[], V | E, string>(
    JSON.stringify,
    (args) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        return func(...args);
      } catch (err) {
        if (err instanceof exc) {
          return err;
        }
        throw err;
      }
    },
  );
  return (...args: any[]) => {
    const val = cache.get(args);
    if (val instanceof exc) {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw val;
    }
    return val;
  };
}
