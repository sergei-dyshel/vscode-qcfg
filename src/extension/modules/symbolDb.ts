'use strict';

import type { ExtensionContext } from 'vscode';
import { workspace } from 'vscode';
import { Modules } from './module';
import {
  executeCommandHandled,
  registerAsyncCommandWrapped,
} from './exception';
import { log } from '../../library/logging';
import { searchInFiles } from './search';

async function createDb() {
  const matches = await searchInFiles({
    pattern: '^.?',
    isRegExp: true,
    isMultiline: true,
  });
  for (const uri of matches.map((loc) => loc.uri)) {
    const path = workspace.asRelativePath(uri);
    log.debug(`Parsing ${path}`);
  }
  executeCommandHandled('qcfg.log.show');
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.symbolDb.create', createDb),
  );
}

Modules.register(activate);
