'use strict';

import { ExtensionContext, workspace, QuickPickItem, commands, Uri, FileType } from "vscode";
import { Modules } from "./module";
import { log } from "./logging";
import * as nodejs from './nodejs';
import { selectFromList } from "./dialog";
import { registerCommandWrapped } from "./exception";
import { expandTemplate } from "./stringUtils";
import { mapAsyncNoThrow } from "./async";
import { readJSON } from "./fileUtils";

let extContext: ExtensionContext;
const PERSISTENT_KEY = 'workspaceHistory';

function getWorkspaceFile(): string|undefined {
  if (workspace.workspaceFile) {
    if (workspace.workspaceFile.scheme === 'untitled') {
      log.debug('Opened untitled project');
      return;
    }
    log.debug('Opened workspace', workspace.workspaceFile.fsPath);
    return workspace.workspaceFile.fsPath;
  }
  if (workspace.workspaceFolders) {
    log.debug('Opened workspace folder', workspace.workspaceFolders[0].uri.fsPath);
    return workspace.workspaceFolders[0].uri.fsPath;
  }
}

function expandTitle(root: string, title: string): string {
  const rootBase = nodejs.path.basename(root, '.code-workspace');
  const rootDir1 = nodejs.path.basename(nodejs.path.dirname(root));
  const rootDir2 =
      nodejs.path.basename(nodejs.path.dirname(nodejs.path.dirname(root)));
  const rootDir3 = nodejs.path.basename(
      nodejs.path.dirname(nodejs.path.dirname(nodejs.path.dirname(root))));
  return expandTemplate(title, {rootBase, rootDir1, rootDir2, rootDir3}, true);
}

async function getWorkspaceConfig(root: string): Promise<string>
{
  const stat = await workspace.fs.stat(Uri.file(root));
  if (stat.type & FileType.Directory) {
    try {
      const settings =
          await readJSON(nodejs.path.join(root, '.vscode', 'settings.json'));
      return expandTitle(root, settings['window.title']);
    } catch (_) {
      return nodejs.path.basename(root);
    }
  } else if (stat.type & FileType.File) {
    try {
      const settings = await readJSON(root);
      return expandTitle(root, settings['settings']['window.title']);
    } catch (_) {
      return nodejs.path.basename(nodejs.path.dirname(root));
    }
  }
  throw new Error('Workspace is not workspace folder nor .code-workspace');
}

function toQuickPickItem(rootAndTitle: [string, string]): QuickPickItem {
  const [root, title] = rootAndTitle;
  return {label: title, description: root};
}

async function openFromHistory(newWindow: boolean) {
  const history: string[] = extContext.globalState.get(PERSISTENT_KEY, []);
  const current = getWorkspaceFile();
  const histWithTitles = await mapAsyncNoThrow(
      history.filter(file => file !== current), getWorkspaceConfig);
  const rootAndTitle = await selectFromList(histWithTitles, toQuickPickItem, {
    matchOnDescription: true,
    placeHolder: newWindow ? 'Open in NEW window' : 'Open in SAME window'
  });
  if (!rootAndTitle)
    return;
  const [root] = rootAndTitle;
  await commands.executeCommand(
      'vscode.openFolder', Uri.file(root), newWindow);
}

async function activate(context: ExtensionContext) {
  context.subscriptions.push(
      registerCommandWrapped(
          'qcfg.openRecent.sameWindow', () => openFromHistory(false)),
      registerCommandWrapped(
          'qcfg.openRecent.newWindow', () => openFromHistory(true)));

  extContext = context;
  const wsFile = getWorkspaceFile();
  if (!wsFile)
        return;
  const globalState = extContext.globalState;
  const history: string[] = globalState.get(PERSISTENT_KEY, []);
  history.removeFirst(wsFile);
  history.unshift(wsFile);
  // await globalState.update(PERSISTENT_KEY, history);
}

Modules.register(activate);
