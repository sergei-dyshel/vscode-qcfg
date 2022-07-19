// these modify prototypes of objects, must be imported first
import '../library/stringPrototype';
import '../library/syntax';
import '../library/tsUtils';
import './utils/locationPrototype';
import './utils/positionPrototype';
import './utils/rangePrototype';
import './utils/selectionPrototype';
import './utils/uriPrototype';

import type { ExtensionContext } from 'vscode';
import { log } from '../library/logging';
import { stringify as str } from '../library/stringify';
import { ALL_MODULES } from './modules/allModules';
import { Modules } from './modules/module';
import { updateContributedCommands } from './utils/commands';
import { setExtensionContext } from './utils/extensionContext';

export async function activate(context: ExtensionContext) {
  console.log('Extension activating');
  setExtensionContext(context);

  await Modules.activateAll(context);
  log.info(`Activated ${str(Modules.fileNames())}`);

  log.info('Extension path', context.extensionPath);

  log.info('Global storage path', context.globalStorageUri.fsPath);
  if (context.storageUri)
    log.info('Workspace storage path', context.storageUri.fsPath);

  // history.activate(context);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (console as any).qcfg = {
    modules: ALL_MODULES,
  };

  await updateContributedCommands();
}

// this method is called when your extension is deactivated
export async function deactivate() {
  await Modules.deactivateAll();
}
