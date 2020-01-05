'use strict';

import { ExtensionContext, workspace } from 'vscode';
import { Modules } from './module';
import { registerAsyncCommandWrapped } from './exception';
import { log } from './logging';
import { searchInFiles } from './search';

// TODO: use ripgrep directly
// look at https://github.com/Microsoft/vscode/issues/48674#issuecomment-422950502
async function listFiles() {
  const locations = await searchInFiles(
    {
      // this pattern will generate exactly one match per file
      pattern: '^(.*\\n)*',
      isMultiline: true,
      isRegExp: true,
    },
    {
      useIgnoreFiles: true,
      useGlobalIgnoreFiles: true,
      followSymlinks: false,
      previewOptions: {
        matchLines: 0,
        charsPerLine: 0,
      },
      afterContext: 0,
      beforeContext: 0,
    },
  );
  return locations.map(loc => loc.uri);
}

async function createDb() {
  // const files = await workspace.findFiles('**');
  // for (const file of files) log.debug(file);

  const files = await listFiles();
  for (const file of files) log.debug(file);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.tagdb.create', createDb),
  );
}

Modules.register(activate);
