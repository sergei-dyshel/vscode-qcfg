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