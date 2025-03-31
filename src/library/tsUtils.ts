/* eslint-disable @typescript-eslint/unbound-method */

import { MultiDictionary } from "@buzz-dee/typescript-collections";

const emptyRegExp = /(?:)/;

/**
 * Create value holder that initializes lazily, e.g. on first use
 */
export function lazyValue<T>(initialize: () => T): () => T {
  let value: T;
  return () => {
    if (value === undefined) {
      value = initialize();
    }
    return value;
  };
}

/**
 * Type-safely copy specific properties into new object.
 */
export function pick<T, K extends keyof T>(obj: T, ...keys: K[]): Pick<T, K> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: any = {};
  for (const key of keys) result[key] = obj[key];
  return result;
}
// see https://stackoverflow.com/questions/61148466/typescript-type-that-matches-any-object-but-not-arrays
// TODO: currently not used
export type NotArray = (
  | Record<string, unknown>
  | string
  | bigint
  | number
  | boolean
) & {
  length?: never;
};

/** Convert union of arrays into array of unions */
export function unionizeArrays<T, Q>(x: T[] | Q[]): Array<T | Q> {
  return x;
}

/**
 * Generic type for equality function used in algorithms and data structures.
 */
export type EqualFunc<T> = (x: T, y: T) => boolean;

export function diffArrays<T>(
  a: T[],
  b: T[],
  equal: EqualFunc<T>,
): [onlyA: T[], onlyB: T[], common: T[]] {
  const onlyA: T[] = [];
  const onlyB: T[] = [];
  const common: T[] = [];

  for (const x of a) {
    if (b.filter((y) => equal(x, y)).isEmpty) onlyA.push(x);
    else common.push(x);
  }
  for (const y of b) {
    if (a.filter((x) => equal(x, y)).isEmpty) onlyB.push(y);
  }
  return [onlyA, onlyB, common];
}

/**
 * Extract subarray [start, end) of any array-like object.
 */
export function arraySlice<T>(
  array: Record<number, T>,
  start: number,
  end: number,
): T[] {
  const result: T[] = [];
  for (let i = start; i < end; i++) {
    result.push(array[i]);
  }
  return result;
}

/**
 * Convert integer to array of bits starting with LSB
 */
export function numberToBitArray(x: number): Array<0 | 1> {
  return [...x.toString(2)].reverse().map((bit) => {
    if (bit === "0") return 0;
    if (bit === "1") return 1;
    throw new Error(
      `Invalid character in binary representation of ${x}: ${bit}`,
    );
  });
}

/**
 * Takes function that does not accept undefined argument and returns function
 * that accepts it and returns undefined in that case
 */
export function propagateUndefined<T, Q>(
  f: (x: T) => Q,
): (x: T | undefined) => Q | undefined {
  return (x: T | undefined): Q | undefined => {
    if (x !== undefined) return f(x);
    return x as undefined;
  };
}

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
    .map((x) => x);
}

export function filterNonNull<T>(array: Array<T | null | undefined>): T[] {
  return array.filter((x) => x !== null && x !== undefined).map((x) => x);
}

export function numberCompare<T>(x: T, y: T): number {
  const xNum = x as unknown as number;
  const yNum = y as unknown as number;
  if (xNum < yNum) return -1;
  if (xNum === yNum) return 0;
  return 1;
}

export function defaultEquals<T>(a: T, b: T) {
  return a === b;
}

export function arrayIter<T>(
  array: T[],
  start?: number,
  end?: number,
  step?: number,
) {
  if (step === 0) throw new Error("Can not have zero step");
  return new ArrayIterator<T>(
    array,
    new NumberIterator(
      start === undefined ? 0 : start,
      end === undefined ? array.length : end,
      step === undefined ? 1 : step,
    ),
  );
}

/**
 * Map array with optional exception handler.
 *
 * When function application results in exception, it's handled by optional
 * **handler**.
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
  // eslint-disable-next-line unicorn/prefer-spread
  return arrays[0].concat(...arrays.slice(1));
}

export function concatNonNullArrays<T>(...arrays: Array<T[] | undefined>): T[] {
  const nonNullArrays = arrays.filter((x) => x !== undefined);
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
  return undefined;
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

/**
 * Generic type for comparison function used in algorithms and data structures.
 *
 * Should return negative if `x < y`, 0 if `x = y` and positive if `x > y`.
 */
export type CompareFunc<T> = (x: T, y: T) => number;

export class NumberIterator implements IterableIterator<number> {
  private cur: number;

  constructor(
    start: number,
    private readonly end: number,
    private readonly step: number,
  ) {
    if (this.step === 0) throw new Error("Can not iterate with step 0");
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

export type ArrayLike<T> = Record<number, T>;

export class ArrayIterator<T> implements IterableIterator<T> {
  constructor(
    private readonly array: ArrayLike<T>,
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

  interface Promise<T> {
    ignoreResult: () => Promise<void>;
  }
}

/** Mapping with default values */
export class DefaultMap<K, V> extends Map<K, V> {
  /**
   * `factory` - either default value and function that receives key and returns
   * a value
   */
  constructor(protected readonly factory: V | ((key: K) => V)) {
    super();
  }

  override get(key: K): V {
    let val = super.get(key);
    if (val) return val;
    val = this.factory instanceof Function ? this.factory(key) : this.factory;
    this.set(key, val);
    return val;
  }
}

export function zipArrays<T1, T2>(
  a: readonly T1[],
  b: readonly T2[],
): Array<[T1, T2]> {
  return a.map((k, i) => [k, b[i]]);
}

export function mapModify<K, V>(
  map: DefaultMap<K, V>,
  key: K,
  fn: (value: V) => V,
): void;
export function mapModify<K, V>(
  map: Map<K, V>,
  key: K,
  fn: (value: V | undefined) => V,
): void;
export function mapModify<K, V>(
  map: Map<K, V>,
  key: K,
  fn: (value: V | undefined) => V,
) {
  map.set(key, fn(map.get(key)));
}

Promise.prototype.ignoreResult = async function <T>(
  this: Promise<T>,
): Promise<void> {
  return this.then(() => {});
};
