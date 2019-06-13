'use strict';

import { MultiDictionary } from "typescript-collections";

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

export function removeFirstFromArray<T>(array: T[], elem: T): boolean
{
  const index = array.indexOf(elem);
  if (index === -1)
    return false;
  array.splice(index, 1);
  return true;
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

export function groupBy<K, T>(
    array: T[], keyFunc: (_: T) => K): MultiDictionary<K, T> {
  const dict = new MultiDictionary<K, T>();
  for (const elem of array)
    dict.setValue(keyFunc(elem), elem);
  return dict;
}

export function maxValue<T>(...args: T[]): T {
  const numArgs = args.map(x => (x as unknown as number));
  return Math.max(...numArgs) as unknown as T;
}

export function minValue<T>(...args: T[]): T {
  const numArgs = args.map(x => (x as unknown as number));
  return Math.min(...numArgs) as unknown as T;
}

export class ReverseArrayIterator<T> implements IterableIterator<T> {
  private idx: number;
  constructor(private array: T[]) {
    this.idx = array.length;
  }
  next(): IteratorResult<T> {
    this.idx--;
    return {done: this.idx < 0, value: this.array[this.idx]};
  }
  [Symbol.iterator]() {
    return this;
  }
}

declare global {
  interface Array<T> {
    /**
     * Iterate over array in reverse order.
     */
    reverseIter(): ReverseArrayIterator<T>;
  }
}

Array.prototype.reverseIter = function<T>(this: T[]) {
  return new ReverseArrayIterator<T>(this);
};