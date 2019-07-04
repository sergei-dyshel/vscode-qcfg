'use strict';

import { ExtensionContext, workspace, QuickPickItem, commands, Uri } from "vscode";
import { Modules } from "./module";
import { log } from "./logging";
import * as nodejs from './nodejs';
import { selectFromList } from "./dialog";
import { registerCommandWrapped } from "./exception";

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

function toQuickPickItem(wsFile: string): QuickPickItem {
  const dir = nodejs.fs.lstatSync(wsFile).isDirectory() ?
      wsFile :
      nodejs.path.parse(wsFile).dir;
  return {label: nodejs.path.basename(dir), description: wsFile};
}

async function openFromHistory(newWindow: boolean) {
  let history: string[] = extContext.globalState.get(PERSISTENT_KEY, []);
  const current = getWorkspaceFile();
  history =
      history.filter(nodejs.fs.existsSync).filter(file => file !== current);
  const wsFile = await selectFromList(history, toQuickPickItem, {
    matchOnDescription: true,
    placeHolder: newWindow ? 'Open in NEW window' : 'Open in SAME window'
  });
  if (!wsFile)
    return;
  await commands.executeCommand(
      'vscode.openFolder', Uri.file(wsFile), newWindow);
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
  await globalState.update(PERSISTENT_KEY, history);
}

Modules.register(activate);
