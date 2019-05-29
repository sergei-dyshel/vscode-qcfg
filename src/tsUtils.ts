'use strict';

export function mapObject<V, R>(
  obj: {[key: string]: V}, func: (v: V) => R): {[key: string]: R} {
const res: {[key: string]: R} = {};
return Object.assign(
    res, ...Object.entries(obj).map(([k, v]) => ({[k]: func(v)})));
}

export function If<T>(cond: any, ifTrue: () => T, ifFalse: () => T): T {
  if (cond)
    return ifTrue();
  else
    return ifFalse();
}

export function mapNonNull<T, V>(
    array: T[], func: (elem: T) => V | null | undefined): V[] {
  return array.map(func)
      .filter(x => (x !== null && x !== undefined))
      .map(x => x!);
}

export function filterNonNull<T>(array: Array<T|null|undefined>): T[] {
  return array.filter(x => (x !== null && x !== undefined)).map(x => x!);
}

export function mapWithThrow<T, V>(
    array: T[], func: (elem: T) => V,
    handler?: (elem: T, err: Error) => (void)): V[] {
  const res: V[] = [];
  for (const elem of array) {
    try {
      res.push(func(elem));
    }
    catch (err) {
      if (handler)
        handler(elem, err);
    }
  }
  return res;
}

export function concatArrays<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0)
    return [];
  return arrays[0].concat(...arrays.slice(1));
}

export function upcastReadonlyArray<B, T extends B>(arr: ReadonlyArray<B>):
    ReadonlyArray<T> {
  return arr as ReadonlyArray<T>;
}

export function upcastArray<B, T extends B>(arr: B[]): T[] {
  return arr as T[];
}

export function callIfNonNull<R>(func: (() => R)|undefined): R|undefined;
export function callIfNonNull<T, R>(
    func: ((_: T) => R)|undefined, _: T): R|undefined;
export function callIfNonNull<T1, T2, R>(
    func: ((_: T1, __: T2) => R)|undefined, _: T1, __: T2): R|undefined;
export function callIfNonNull(func: any, ...args: any[]) {
  if (func)
    return func(...args);
  return;
}