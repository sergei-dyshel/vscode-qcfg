/**
 * Subset of {@link Map}
 */
export interface MapLike<K, V> {
  clear: () => void;
  delete: (key: K) => boolean;
  get: (key: K) => V | undefined;
  has: (key: K) => boolean;
  set: (key: K, value: V) => this;
  readonly size: number;
  values: () => IterableIterator<V>;
}

/**
 * Similar to {@link MapLike} but `get()` always returns a value.
 */
export type DefaultMapLike<K, V> = Omit<MapLike<K, V>, "get"> & {
  get: (key: K) => V;
};

/**
 * Allows mapping from arbitrary type by providing an adapter - function that
 * converts from given key type to key type that works with {@link Map}
 */
export class MapAdapter<K, V, A> implements MapLike<K, V> {
  private readonly map: Map<A, V>;

  constructor(private readonly adapter: (_: K) => A) {
    this.map = new Map<A, V>();
  }

  clear(): void {
    this.map.clear();
  }

  delete(key: K): boolean {
    return this.map.delete(this.adapter(key));
  }

  get(key: K): V | undefined {
    return this.map.get(this.adapter(key));
  }

  has(key: K): boolean {
    return this.map.has(this.adapter(key));
  }

  set(key: K, value: V): this {
    this.map.set(this.adapter(key), value);
    return this;
  }

  get size(): number {
    return this.map.size;
  }

  values() {
    return this.map.values();
  }
}

/**
 * Extends {@link MapAdapter} with default factory function
 */
export class DefaultMapAdapter<K, V, A = string>
  extends MapAdapter<K, V, A>
  implements DefaultMapLike<K, V>
{
  constructor(
    adapter: (_: K) => A,
    protected readonly factory: V | ((key: K) => V),
  ) {
    super(adapter);
  }

  override get(key: K): V {
    let val = super.get(key);
    if (val) return val;
    val = this.factory instanceof Function ? this.factory(key) : this.factory;
    this.set(key, val);
    return val;
  }
}

/* TODO: move defaultMap here */
