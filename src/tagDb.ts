'use strict';

import { ExtensionContext, workspace } from 'vscode';
import { Modules } from './module';
import { registerCommandWrapped } from './exception';

async function createDb() {
  const files = await workspace.findFiles('**');
  return files;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerCommandWrapped('qcfg.tagdb.create', createDb)
  );
}

Modules.register(activate);
