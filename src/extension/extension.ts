'use strict';

// these modify prototypes of objects, must be imported first
import '../library/tsUtils';
import '../library/stringPrototype';
import '../library/syntax';
import './utils/positionPrototype';
import './utils/rangePrototype';
import './utils/locationPrototype';
import './utils/selectionPrototype';
import './utils/uriPrototype';

import { ALL_MODULES } from './modules/allModules';
import type { ExtensionContext } from 'vscode';
import { Modules } from './modules/module';
import { stringify as str } from '../library/stringify';
import { log } from '../library/logging';

export function activate(context: ExtensionContext) {
  console.log('Extension active');

  Modules.activateAll(context);
  log.info(`Activated ${str(Modules.fileNames())}`);

  // history.activate(context);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).qcfg = {
    modules: ALL_MODULES,
  };
}

// this method is called when your extension is deactivated
export async function deactivate() {
  // await history.deactivate();
}
