import type { Memento } from "vscode";
import type { JsonTypes } from "../../library/json";
import { extensionContext } from "./extensionContext";

export enum PersistentScope {
  GLOBAL = "global",
  WORKSPACE = "workspace",
}

export interface PersistentStorage<T extends JsonTypes.Any | undefined> {
  get: () => T;
  update: (value: T) => Promise<void>;
}

export function getMemento(scope: PersistentScope) {
  return scope === PersistentScope.GLOBAL
    ? extensionContext().globalState
    : extensionContext().workspaceState;
}

export function getStoragePath(scope: PersistentScope) {
  return scope === PersistentScope.GLOBAL
    ? extensionContext().globalStorageUri.fsPath
    : extensionContext().storageUri?.fsPath;
}

/**
 * Wrapper for reading/writing to persistent storage.
 *
 * NOTE: Can be initialized at any time, but `get/update` are only allowed after
 * extension is activated.
 */
export class PersistentState<T extends JsonTypes.Any | undefined>
  implements PersistentStorage<T>
{
  GLOBAL = PersistentScope.GLOBAL;
  WORKSPACE = PersistentScope.WORKSPACE;

  constructor(
    /** Name of key in persistent storage */
    private readonly key: string,

    /** Value to return in `get` is not set before */
    private readonly defaultValue: T,

    /** Scope of persistent storage */
    private readonly scope = PersistentScope.GLOBAL,
  ) {}

  get(): T {
    return this.memento().get<T>(this.key, this.defaultValue);
  }

  async update(value: T): Promise<void> {
    return this.memento().update(this.key, value);
  }

  private memento(): Memento {
    return getMemento(this.scope);
  }
}
