export interface DisposableLike {
  dispose: () => unknown;
}

export class DisposableHolder<T extends DisposableLike>
  implements DisposableLike
{
  private value?: T;

  constructor(value?: T) {
    this.set(value);
  }

  get(): T | undefined {
    return this.value;
  }

  set(value?: T) {
    this.value?.dispose();
    this.value = value;
  }

  dispose() {
    this.set();
  }
}
