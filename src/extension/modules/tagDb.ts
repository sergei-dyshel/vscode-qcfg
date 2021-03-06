'use strict';

import type { ExtensionContext } from 'vscode';
import { workspace } from 'vscode';
import { Modules } from './module';
import { registerAsyncCommandWrapped } from './exception';

async function createDb() {
  return workspace.findFiles('**');
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.tagdb.create', createDb),
  );
}

Modules.register(activate);
