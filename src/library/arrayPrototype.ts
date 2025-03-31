import { defaultCompare } from "./compare";
import {
  arrayIter,
  CompareFunc,
  defaultEquals,
  izip,
  numberCompare,
} from "./tsUtils";

declare global {
  interface Array<T> extends ReadonlyArray<T> {
    /** Last element of array (consistent with stack-like push()/pop() ). */
    readonly top: T | undefined;
    /**
     * Minimum element of array.
     *
     * @param cmd See {@linkcode max}
     */
    min: (cmp?: (x: T, y: T) => number) => T | undefined;
    /**
     * Maximum element of array.
     *
     * @param cmd Returns negative if x < y, 0 if x === y and positive if x > Y
     */
    max: (cmp?: (x: T, y: T) => number) => T | undefined;
    equals: (that: T[], eq?: (x: T, y: T) => boolean) => boolean;
    removeFirst: (val: T) => boolean;

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

    /** Sort by key extracted from operands */
    sortByKey: <V>(keyFn: (_: T) => V, compareFn?: CompareFunc<V>) => this;
  }

  interface ReadonlyArray<T> {
    reversed: () => readonly T[];
    /**
     * Iterate over array in reverse order.
     */
    reverseIter: () => Iterable<T>;
    pairIter: () => Iterable<[T, T]>;
    readonly isEmpty: boolean;
    firstOf: (cond: (val: T) => boolean) => T | undefined;

    /** Indexes of all elements equal to given one */
    allIndexesOf: (searchElement: T, fromIndex?: number) => number[];

    /**
     * Binary search value and return its index.
     *
     * `mode` determines how to act when there is no exact match.
     *
     * In `left` mode return LARGEST `i` so that `a[i] <= x`. If already `a[0] >
     * x`, return `0`.
     *
     * In `right` mode return SMALLEST `i` so that `a[i] >= x`. If already
     * `a[n-1] < x`, return `n`.
     *
     * XXX: currently unused
     */
    binarySearch: (
      value: T,
      compare?: CompareFunc<T>,
      mode?: "left" | "right",
    ) => number;
  }
}

Array.prototype.binarySearch = function <T>(
  this: T[],
  value: T,
  compare = numberCompare,
  mode: "left" | "right" = "right",
): number {
  let left = 0;
  let right = this.length;
  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    const cmp = compare(this[mid], value);

    if (mode === "left") {
      if (cmp > 0) right = mid;
      left = mid + 1;
    } else {
      if (cmp < 0) left = mid + 1;
      right = mid;
    }
  }
  return left;
};

Array.prototype.isAnyTrue = function <T>(this: T[]): boolean {
  return this.some(Boolean);
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
      unique.some((item1) => equals(item, item1)) ? unique : [...unique, item],
    [],
  );
};

Array.prototype.group = function <T>(this: T[], func: (x: T, y: T) => boolean) {
  return this.reduce<T[][]>((prev: T[][], cur: T) => {
    if (prev.length === 0 || !func(prev.at(-1)![0], cur)) {
      prev.push([cur]);
    } else {
      prev.at(-1)!.push(cur);
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

Array.prototype.sortByKey = function <T>(
  this: T[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyFn: (_: T) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  compareFn?: CompareFunc<any>,
) {
  const cmp = compareFn === undefined ? defaultCompare : compareFn;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return this.sort((a: T, b: T) => cmp(keyFn(a), keyFn(b)));
};

Array.prototype.forEachRight = function <T>(
  this: T[],
  callbackfn: (value: T, index: number, array: T[]) => void,
): void {
  // eslint-disable-next-line sonarjs/no-ignored-return
  this.reduceRight((_, cur, index, array) => {
    callbackfn(cur, index, array);
    return undefined;
  }, undefined);
};

Array.prototype.reversed = function <T>(this: T[]) {
  return [...this.reverseIter()];
};

Array.prototype.reverseIter = function <T>(this: T[]) {
  return arrayIter(this, this.length - 1, 0, -1);
};

Array.prototype.pairIter = function <T>(this: T[]) {
  return izip(
    arrayIter(this, 0, this.length - 1),
    arrayIter(this, 1, this.length),
  );
};

Array.prototype.removeFirst = function <T>(this: T[], val: T): boolean {
  const index = this.indexOf(val);
  if (index === -1) return false;
  this.splice(index, 1);
  return true;
};

Array.prototype.allIndexesOf = function <T>(
  this: T[],
  searchElement: T,
  fromIndex?: number,
): number[] {
  const inds: number[] = [];
  for (;;) {
    const ind = this.indexOf(searchElement, fromIndex);
    if (ind === -1) {
      break;
    } else {
      inds.push(ind);
      fromIndex = ind + 1;
    }
  }
  return inds;
};

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

Object.defineProperty(Array.prototype, "top", {
  get<T>(): T | undefined {
    if (this.length > 0) return this.at(-1);
    return undefined;
  },
});

Object.defineProperty(Array.prototype, "isEmpty", {
  get(): boolean {
    return this.length === 0;
  },
});
