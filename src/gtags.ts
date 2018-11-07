'use strict';

import * as vscode from 'vscode';
import * as fileUtils from './fileUtils';
import * as tasks from './tasks';
import * as saveAll from './saveAll';
import * as logging from './logging';

import * as path from 'path';

const log = new logging.Logger('gtags');

async function onSave(document: vscode.TextDocument) {
  const {wsFolder, relPath} = fileUtils.getDocumentRoot(document);
  const hasGtags = await fileUtils.existsInRoot(wsFolder, 'GTAGS');
  if (!hasGtags)
    return;
  try {
    await tasks.runOneTime('gtags', {
      command: 'global --single-update ' + relPath,
      cwd: wsFolder.uri.fsPath
    });
  } catch (err) {
    vscode.window.showErrorMessage('gtags update failed');
  }
}

async function findGtagsDir(dir: string) {
  while (dir !== '/') {
    if (await fileUtils.exists(path.join(dir, 'GTAGS'))) {
      return dir;
    } else if (dir === '/') {
      return;
    } else {
      dir = path.dirname(dir);
    }
  }
}

async function onSaveAll(docs: saveAll.DocumentsInFolder) {
  const gtagsDir = await findGtagsDir(docs.folder.uri.fsPath);
  if (!gtagsDir) {
    log.debug(`No GTAGS in ${docs.folder.name}`);
    return;
  } else {
    log.debug(`Found GTAGS in ${gtagsDir}`);
  }

  const docPaths = docs.documents.map(
      (doc) => path.relative(gtagsDir, doc.uri.fsPath));

  log.info(`Gtags on ${docPaths} in "${docs.folder.name}"`);
  const cmd = 'gtags-update.sh ' + docPaths.join(' ');
  try {
    await tasks.runOneTime('gtags', {
      command: cmd,
      cwd: gtagsDir
    });
  } catch (err) {
    vscode.window.showErrorMessage('gtags update failed');
  }
}

export function activate(context: vscode.ExtensionContext) {
  // context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(onSave));
  context.subscriptions.push(saveAll.onEvent(onSaveAll));
}