'use strict';

import {
  commands,
  ExtensionContext,
  SourceControlResourceState,
  Uri,
  window,
} from 'vscode';
import { log } from '../../library/logging';
import { Modules } from './module';

// inspired by https://github.com/lacroixdavid1/vscode-format-context-menu

async function formatUris(uris: Uri[]) {
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

async function formatFilesInExplorer(clickedFile: Uri, selectedFiles: Uri[]) {
  return formatUris(selectedFiles.isEmpty ? [clickedFile] : selectedFiles);
}

async function formatFilesInScm(
  ...selectedFiles: SourceControlResourceState[]
) {
  return formatUris(selectedFiles.map((x) => x.resourceUri));
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    commands.registerCommand(
      'qcfg.formatSelectedFilesInExplorer',
      formatFilesInExplorer,
    ),
    commands.registerCommand('qcfg.formatSelectedFilesInSCM', formatFilesInScm),
  );
}

Modules.register(activate);
