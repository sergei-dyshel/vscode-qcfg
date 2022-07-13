import { Disposable } from 'vscode';
import { assert } from './exception';

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

/**
 * Holds many disposables and disposes them at once
 *
 * Should used as superclass.
 */
export class DisposableCollection implements DisposableLike {
  constructor(protected readonly disposables: DisposableLike[] = []) {}

  dispose() {
    Disposable.from(...this.disposables).dispose();
    this.disposables.clear();
  }
}

/**
 * Array with new push operation which returns `Disposable`
 * which can be used to remove the item from array.
 */
export class ArrayOfDisposables<T> extends Array<T> {
  pushDisposable(item: T): DisposableLike {
    this.push(item);
    return {
      dispose: () => {
        assert(this.removeFirst(item), 'Can not find callback on dispose');
      },
    };
  }
}
