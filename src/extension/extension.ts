// these modify prototypes of objects, must be imported first
import '../library/stringPrototype';
import '../library/syntax';
import '../library/tsUtils';
import './utils/locationPrototype';
import './utils/positionPrototype';
import './utils/rangePrototype';
import './utils/selectionPrototype';
import './utils/uriPrototype';

// must be imported first
import './modules/logging';

import type { ExtensionContext } from 'vscode';
import { log } from '../library/logging';
import { stringify as str } from '../library/stringify';
import { Modules } from './modules/module';
import { updateContributedCommands } from './utils/commands';
import { setExtensionContext } from './utils/extensionContext';

// eslint-disable-next-line unicorn/prefer-module
const modulesCtx = require.context('./modules', false /* deep */, /.*\.ts$/);
// eslint-disable-next-line unicorn/no-array-for-each
modulesCtx.keys().forEach(modulesCtx);

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

  await updateContributedCommands();
}

// this method is called when your extension is deactivated
export async function deactivate() {
  await Modules.deactivateAll();
}
