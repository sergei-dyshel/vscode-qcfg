/* eslint-disable @typescript-eslint/unbound-method */

import { MultiDictionary } from 'typescript-collections';

const emptyRegExp = new RegExp('');

export function isEmptyRegExp(re: RegExp) {
  return re.source === emptyRegExp.source;
}

export function mapObjectValues<V, R>(
  obj: Record<string, V>,
  func: (k: string, v: V) => R,
): Record<string, R> {
  const res: Record<string, R> = {};
  const entryObjs = mapObjectToArray(obj, (k, v) => ({ [k]: func(k, v) }));
  return Object.assign(res, ...entryObjs);
}

export function mapObjectToArray<V, R>(
  obj: Record<string, V>,
  func: (k: string, v: V) => R,
): R[] {
  return Object.entries(obj).map(([k, v]) => func(k, v));
}

export function mapNonNull<T, V>(
  array: T[],
  func: (elem: T) => V | null | undefined,
): V[] {
  return array
    .map(func)
    .filter((x) => x !== null && x !== undefined)
    .map((x) => x!);
}

export function filterNonNull<T>(array: Array<T | null | undefined>): T[] {
  return array.filter((x) => x !== null && x !== undefined).map((x) => x!);
}

/**
 * Map array with optional exception handler.
 *
 * When function application results in exception,
 * it's handled by optional **handler**.
 *
 * If handler returns values it will be added to result.
 */
export function mapWithThrow<T, V>(
  array: T[],
  func: (elem: T) => V,
  handler?: (elem: T, err: unknown) => V | undefined,
): Array<[T, V]> {
  const res: Array<V | undefined> = [];
  for (const elem of array) {
    try {
      res.push(func(elem));
    } catch (err: unknown) {
      if (handler) {
        const val = handler(elem, err);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition, @typescript-eslint/prefer-nullish-coalescing
        res.push(val || undefined);
      } else {
        res.push(undefined);
      }
    }
  }
  return zipArrays(array, res).filter((pair) => pair[1] !== undefined) as Array<
    [T, V]
  >;
}

export function concatArrays<T>(...arrays: T[][]): T[] {
  if (arrays.length === 0) return [];
  return arrays[0].concat(...arrays.slice(1));
}

export function concatNonNullArrays<T>(...arrays: Array<T[] | undefined>): T[] {
  const nonNullArrays = arrays.filter((x) => x !== undefined) as T[][];
  return concatArrays(...nonNullArrays);
}

export function upcastReadonlyArray<B, T extends B>(
  arr: readonly B[],
): readonly T[] {
  return arr as readonly T[];
}

export function upcastArray<B, T extends B>(arr: B[]): T[] {
  return arr as T[];
}

export function callIfNonNull<R>(func: (() => R) | undefined): R | undefined;
export function callIfNonNull<T, R>(
  func: ((_: T) => R) | undefined,
  _: T,
): R | undefined;
export function callIfNonNull<T1, T2, R>(
  func: ((_: T1, __: T2) => R) | undefined,
  _: T1,
  __: T2,
): R | undefined;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function callIfNonNull(func: any, ...args: any[]) {
  if (func) return func(...args);
  return;
}

export function groupBy<K, T>(
  array: T[],
  keyFunc: (_: T) => K,
): MultiDictionary<K, T> {
  const dict = new MultiDictionary<K, T>();
  for (const elem of array) dict.setValue(keyFunc(elem), elem);
  return dict;
}

export function maxNumber<T>(...args: T[]): T {
  return args.map((x) => x as unknown as number).max() as unknown as T;
}

export function minNumber<T>(...args: T[]): T {
  return args.map((x) => x as unknown as number).min() as unknown as T;
}

export class NumberIterator implements IterableIterator<number> {
  private cur: number;

  constructor(
    start: number,
    private readonly end: number,
    private readonly step: number,
  ) {
    if (this.step === 0) throw new Error('Can not iterate with step 0');
    this.cur = start;
  }

  next(): IteratorResult<number> {
    const result = { done: this.reachedEnd(), value: this.cur };
    this.cur += this.step;
    return result;
  }

  private reachedEnd(): boolean {
    if (this.step > 0) return this.cur >= this.end;
    return this.cur < this.end;
  }

  [Symbol.iterator]() {
    return this;
  }
}

export class ArrayIterator<T> implements IterableIterator<T> {
  constructor(
    private readonly array: T[],
    private readonly numIter: NumberIterator,
  ) {}

  next(): IteratorResult<T> {
    const numRes = this.numIter.next();
    if (numRes.done) return { done: true, value: undefined };
    return { done: false, value: this.array[numRes.value] };
  }

  [Symbol.iterator]() {
    return this;
  }
}

export class ZipIterator<T, U> implements IterableIterator<[T, U]> {
  constructor(
    private readonly iter1: Iterator<T>,
    private readonly iter2: Iterator<U>,
  ) {}

  next(): IteratorResult<[T, U]> {
    const result1 = this.iter1.next();
    const result2 = this.iter2.next();
    if (result1.done || result2.done) return { done: true, value: undefined };
    return { done: false, value: [result1.value, result2.value] };
  }

  [Symbol.iterator]() {
    return this;
  }
}

export function izip<T, U>(
  iter1: Iterable<T>,
  iter2: Iterable<U>,
): Iterable<[T, U]> {
  return new ZipIterator(iter1[Symbol.iterator](), iter2[Symbol.iterator]());
}

declare global {
  // Allows passing Thenable as Promise
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface Thenable<T> extends Promise<T> {}

  interface Array<T> {
    /**
     * Iterate over array in reverse order.
     */
    reverseIter: () => Iterable<T>;
    iter: (start?: number, end?: number, step?: number) => Iterable<T>;
    pairIter: () => Iterable<[T, T]>;
    /** Last element of array (consistent with stack-like push()/pop() ). */
    readonly top: T | undefined;
    readonly isEmpty: boolean;
    /**
     * Minimum element of array.
     *
     * @param cmd see {@linkcode max}
     */
    min: (cmp?: (x: T, y: T) => number) => T | undefined;
    /**
     * Maximum element of array.
     *
     * @param cmd returns negative if `x < y`, 0 if `x === y` and positive if `x > y`
     */
    max: (cmp?: (x: T, y: T) => number) => T | undefined;
    equals: (that: T[], eq?: (x: T, y: T) => boolean) => boolean;
    removeFirst: (val: T) => boolean;
    firstOf: (cond: (val: T) => boolean) => T | undefined;
    forEachRight: (
      callbackfn: (value: T, index: number, array: T[]) => void,
    ) => void;
    isAnyTrue: () => boolean;
    areAllTrue: () => boolean;

    /** Remove all elements */
    clear: () => void;

    /** Array of unique elements (works on unsorted too) */
    uniq: (equals: (x: T, y: T) => boolean) => T[];

    /** Group (sorted) array by binary predicate, return array of groups */
    group: (func: (x: T, y: T) => boolean) => T[][];

    sorted: (cmp?: (x: T, y: T) => number) => T[];
  }

  interface ReadonlyArray<T> {
    reverseIter: () => Iterable<T>;
    iter: (start: number, end: number, step?: number) => Iterable<T>;
    pairIter: () => Iterable<[T, T]>;
    readonly isEmpty: boolean;
  }

  interface Map<K, V> {
    keySet: () => Set<K>;
    modify: (key: K, fn: (value: V | undefined) => V) => void;
  }

  interface Promise<T> {
    ignoreResult: () => Promise<void>;
  }
}

Array.prototype.isAnyTrue = function <T>(this: T[]): boolean {
  return this.find(Boolean) !== undefined;
};

Array.prototype.areAllTrue = function <T>(this: T[]): boolean {
  return this.every(Boolean);
};

Array.prototype.uniq = function <T>(
  this: T[],
  equals: (x: T, y: T) => boolean,
): T[] {
  return this.reduce<T[]>(
    (unique, item) =>
      unique.find((item1) => equals(item, item1)) !== undefined
        ? unique
        : [...unique, item],
    [],
  );
};

Array.prototype.group = function <T>(this: T[], func: (x: T, y: T) => boolean) {
  return this.reduce<T[][]>((prev: T[][], cur: T) => {
    if (prev.length === 0 || !func(prev[prev.length - 1][0], cur)) {
      prev.push([cur]);
    } else {
      prev[prev.length - 1].push(cur);
    }
    return prev;
  }, []);
};

Array.prototype.sorted = function <T>(
  this: T[],
  cmp?: (x: T, y: T) => number,
): T[] {
  return this.slice().sort(cmp);
};

Array.prototype.forEachRight = function <T>(
  this: T[],
  callbackfn: (value: T, index: number, array: T[]) => void,
): void {
  this.reduceRight((_, cur, index, array) => {
    callbackfn(cur, index, array);
    return undefined;
  }, undefined);
};

Array.prototype.iter = function <T>(
  this: T[],
  start?: number,
  end?: number,
  step?: number,
) {
  if (step === 0) throw new Error('Can not have zero step');
  return new ArrayIterator<T>(
    this,
    new NumberIterator(
      start === undefined ? 0 : start,
      end === undefined ? this.length : end,
      step === undefined ? 1 : step,
    ),
  );
};

Array.prototype.reverseIter = function <T>(this: T[]) {
  return this.iter(this.length - 1, 0, -1);
};

Array.prototype.pairIter = function <T>(this: T[]) {
  return izip(this.iter(0, this.length - 1), this.iter(1, this.length));
};

Array.prototype.removeFirst = function <T>(this: T[], val: T): boolean {
  const index = this.indexOf(val);
  if (index === -1) return false;
  this.splice(index, 1);
  return true;
};

function numberCompare<T>(x: T, y: T): number {
  const xNum = x as unknown as number;
  const yNum = y as unknown as number;
  if (xNum < yNum) return -1;
  if (xNum === yNum) return 0;
  return 1;
}

function defaultEquals<T>(a: T, b: T) {
  return a === b;
}

Array.prototype.firstOf = function <T>(
  this: T[],
  cond: (val: T) => boolean,
): T | undefined {
  const idx = this.findIndex(cond);
  if (idx === -1) return undefined;
  return this[idx];
};

Array.prototype.equals = function <T>(
  this: T[],
  that: T[],
  eq: (x: T, y: T) => boolean = defaultEquals,
) {
  if (this.length !== that.length) return false;
  for (let i = 0; i < this.length; ++i) if (!eq(this[i], that[i])) return false;
  return true;
};

Array.prototype.min = function <T>(
  this: T[],
  cmp: (x: T, y: T) => number = numberCompare,
) {
  if (!this.length) return;
  return this.reduce((x, y) => (cmp(x, y) < 0 ? x : y));
};

Array.prototype.max = function <T>(
  this: T[],
  cmp: (x: T, y: T) => number = numberCompare,
) {
  if (!this.length) return;
  return this.reduce((x, y) => (cmp(x, y) < 0 ? y : x));
};

Array.prototype.clear = function <T>(this: T[]) {
  this.splice(0, this.length);
};

Object.defineProperty(Array.prototype, 'top', {
  get<T>(): T | undefined {
    if (this.length > 0) return this[this.length - 1];
    return undefined;
  },
});

Object.defineProperty(Array.prototype, 'isEmpty', {
  get(): boolean {
    return this.length === 0;
  },
});

/** Mapping with default values */
export class DefaultMap<K, V> extends Map<K, V> {
  /** `factory` - either default value and function that receives key and returns a value */
  constructor(protected readonly factory: V | ((key: K) => V)) {
    super();
  }

  override get(key: K): V {
    let val = super.get(key);
    if (val) return val;
    if (this.factory instanceof Function) val = this.factory(key);
    else val = this.factory;
    this.set(key, val);
    return val;
  }

  override modify: (
    this: DefaultMap<K, V>,
    key: K,
    fn: (value: V) => V,
  ) => void = Map.prototype.modify;
}

export function zipArrays<T1, T2>(a: T1[], b: T2[]): Array<[T1, T2]> {
  return a.map((k, i) => [k, b[i]]);
}

Map.prototype.keySet = function <K, V>(this: Map<K, V>): Set<K> {
  const keys = new Set<K>();
  for (const key of this.keys()) keys.add(key);
  return keys;
};

Map.prototype.modify = function <K, V>(
  this: Map<K, V>,
  key: K,
  fn: (value: V | undefined) => V,
) {
  this.set(key, fn(this.get(key)));
};

Promise.prototype.ignoreResult = async function <T>(
  this: Promise<T>,
): Promise<void> {
  return this.then(() => {});
};
