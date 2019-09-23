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

export function maxNumber<T>(...args: T[]): T {
  return args.map(x => (x as unknown as number)).max() as unknown as T;
}

export function minNumber<T>(...args: T[]): T {
  return args.map(x => (x as unknown as number)).min() as unknown as T;
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
    readonly top: T|undefined;
    readonly isEmpty: boolean;
    min(cmp?: (x: T, y: T) => number): T|undefined;
    max(cmp?: (x: T, y: T) => number): T|undefined;
    equals(that: T[], eq?: (x: T, y: T) => boolean): boolean;
    removeFirst(val: T): boolean;
  }

  interface ReadonlyArray<T> {
    reverseIter(): ReverseArrayIterator<T>;
    readonly isEmpty: boolean;
  }
}

Array.prototype.reverseIter = function<T>(this: T[]) {
  return new ReverseArrayIterator<T>(this);
};

Array.prototype.removeFirst = function<T>(this: T[], val: T): boolean {
  const index = this.indexOf(val);
  if (index === -1)
    return false;
  this.splice(index, 1);
  return true;
};

function numberCompare<T>(x: T, y: T): number {
  const xNum = x as unknown as number;
  const yNum = y as unknown as number;
  if (xNum < yNum)
    return -1;
  else if (xNum === yNum)
    return 0;
  return 1;
}

function defaultEquals<T>(a: T, b:T) {
  return a === b;
}

Array.prototype.equals = function<T>(
    this: T[], that: T[], eq: (x: T, y: T) => boolean = defaultEquals) {
  if (this.length !== that.length)
    return false;
  for (let i = 0; i < this.length; ++i)
    if (!eq(this[i], that[i]))
      return false;
  return true;
};

Array.prototype.min = function<T>(
    this: T[], cmp: (x: T, y: T) => number = numberCompare) {
  if (!this.length)
    return;
  return this.reduce((x, y) => (cmp(x, y) === -1 ? x : y));
};

Array.prototype.max = function<T>(
    this: T[], cmp: (x: T, y: T) => number = numberCompare) {
  if (!this.length)
    return;
  return this.reduce((x, y) => (cmp(x, y) === -1 ? y : x));
};

Object.defineProperty(Array.prototype, 'top', {
  get<T>(): T | undefined {
    if (this.length > 0)
      return this[this.length - 1];
  }
});

Object.defineProperty(Array.prototype, 'isEmpty', {
  get(): boolean {
    return this.length === 0;
  }
});

export class DefaultMap<K, V> extends Map<K, V> {
  constructor(private factory: (key: K) => V) {
    super();
  }
  get(key: K): V {
    let val = super.get(key);
    if (val)
      return val;
    val = this.factory(key);
    this.set(key, val);
    return val;
  }
}

export type PromiseType<T extends Promise<any>> =
    T extends Promise<infer R>? R : any;


export function zipArrays<T1, T2>(a: T1[], b: T2[]): Array<[T1, T2]> {
  return a.map((k, i) => [k, b[i]]);
}