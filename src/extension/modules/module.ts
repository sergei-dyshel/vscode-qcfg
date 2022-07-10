// Must not import any modules
import type { ExtensionContext } from 'vscode';
import * as nodejs from '../../library/nodejs';
import { getCallsite } from '../../library/sourceMap';

export namespace Modules {
  export function register(
    activate: ActivationFunc,
    deactivate?: DeactivationFunc,
  ) {
    const name = nodejs.path.parse(getCallsite(2).fileName).name;
    modules.push({ name, activate, deactivate });
  }

  export async function activateAll(context: ExtensionContext) {
    for (const module of modules) {
      await module.activate(context);
    }
  }

  export async function deactivateAll() {
    for (const module of modules.reverseIter()) {
      if (module.deactivate) await module.deactivate();
    }
  }

  export function fileNames() {
    return modules.map((module) => module.name);
  }
}

type ActivationFunc = (_: ExtensionContext) => void | Promise<void>;
type DeactivationFunc = () => void | Promise<void>;

interface Module {
  name: string;
  activate: ActivationFunc;
  deactivate?: DeactivationFunc;
}

const modules: Module[] = [];
