/* eslint-disable @typescript-eslint/no-explicit-any */

// type NotVoid = object | string | boolean | symbol | number | null | undefined;
export type AsyncFunction = (...args: any[]) => Promise<any>;
/**
 * NOTE: Must used `undefined` because just using `void` wouldn't work,
 * see https://stackoverflow.com/questions/57951850/is-there-not-promise-type-in-typescipt
 */
// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
export type VoidFunction = (...args: any[]) => void | undefined;
export type AnyFunction = (...args: any[]) => any;

export type PromiseType<T extends Promise<unknown>> = T extends Promise<infer R>
  ? R
  : unknown;

export type FirstParameter<T extends (arg1: any, ...args: any) => any> =
  T extends (arg1: infer P, ...args: any) => any ? P : never;

export function discardReturn<T extends AnyFunction>(
  func: T,
): (...args: Parameters<T>) => void {
  return (...args: Parameters<T>) => {
    func(...args);
  };
}
