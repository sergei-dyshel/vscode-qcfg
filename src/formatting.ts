'use strict';

import { ExtensionContext, commands, Uri, window } from "vscode";
import { Modules } from "./module";
import { log } from "./logging";

// inspired by https://github.com/lacroixdavid1/vscode-format-context-menu

async function formatFilesInExplorer(clickedFile: Uri, selectedFiles: Uri[]) {
  const uris = selectedFiles || [clickedFile];
  for (const uri of uris) {
    try {
      await window.showTextDocument(uri);
    } catch (err) {
      log.error(`Could not open "${uri}": ${err}`);
      continue;
    }
    try {
      await commands.executeCommand('editor.action.formatDocument');
    } catch (err) {
      log.error(`Could not format "${uri}": ${err}`);
    }
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
      commands.registerCommand(
          'qcfg.formatSelectedFilesInExplorer', formatFilesInExplorer),
  );
}

Modules.register(activate);
