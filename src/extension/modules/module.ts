'use strict';

// Must not import any modules
import { getCallsite } from '../../library/sourceMap';
import { ExtensionContext } from 'vscode';
import * as nodejs from '../../library/nodejs';

export namespace Modules {
  export function register(
    activate: ActivationFunc,
    deactivate?: ActivationFunc,
  ) {
    const name = nodejs.path.parse(getCallsite(2).fileName).name;
    modules.push({ name, activate, deactivate });
  }

  export function activateAll(context: ExtensionContext) {
    for (const module of modules) {
      module.activate(context);
    }
  }

  export function deactivateAll(context: ExtensionContext) {
    for (const module of modules.reverseIter()) {
      if (module.deactivate) module.deactivate(context);
    }
  }

  export function fileNames() {
    return modules.map((module) => module.name);
  }
}

type ActivationFunc = (_: ExtensionContext) => void;

interface Module {
  name: string;
  activate: ActivationFunc;
  deactivate?: ActivationFunc;
}

const modules: Module[] = [];
