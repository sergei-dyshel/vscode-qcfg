'use strict';

import type {
  ExtensionContext,
  QuickInputButton,
  QuickPickItem,
  QuickPickItemButtonEvent,
} from 'vscode';
import { FileType, ThemeIcon, Uri, window, workspace } from 'vscode';
import { assert } from '../../library/exception';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { expandTemplate } from '../../library/stringUtils';
import { showQuickPick } from '../utils/quickPick';
import { openFolder } from '../utils/window';
import { mapAsyncNoThrow } from './async';
import { handleStd, registerAsyncCommandWrapped } from './exception';
import { parseJsonFileAsync } from './json';
import { Modules } from './module';

let extContext: ExtensionContext;
const PERSISTENT_KEY = 'workspaceHistory';

/**
 * Workspace file path or folder path if single folder is opened, `undefined` otherwise
 */
export function getWorkspaceFile(): string | undefined {
  if (workspace.workspaceFile) {
    if (workspace.workspaceFile.scheme === 'untitled') {
      log.debug('Opened untitled project');
      return undefined;
    }
    log.debug('Opened workspace', workspace.workspaceFile.fsPath);
    return workspace.workspaceFile.fsPath;
  }
  if (workspace.workspaceFolders) {
    assert(workspace.workspaceFolders.length === 1);
    log.debug(
      'Opened workspace folder',
      workspace.workspaceFolders[0].uri.fsPath,
    );
    return workspace.workspaceFolders[0].uri.fsPath;
  }
  return undefined;
}

export function getWorkspaceName(): string | undefined {
  const wsFile = getWorkspaceFile();
  if (!wsFile) return undefined;
  const title = workspace.getConfiguration().get<string>('window.title');
  if (!title) return undefined;
  return expandTitle(wsFile, title);
}

function expandTitle(root: string, title: string): string {
  const isWorkspace = nodejs.path.extname(root) === '.code-workspace';
  const rootBase = nodejs.path.basename(root, '.code-workspace');
  const rootDir1 = nodejs.path.basename(nodejs.path.dirname(root));
  const rootDir2 = nodejs.path.basename(
    nodejs.path.dirname(nodejs.path.dirname(root)),
  );
  const rootDir3 = nodejs.path.basename(
    nodejs.path.dirname(nodejs.path.dirname(nodejs.path.dirname(root))),
  );
  const folderName = isWorkspace ? rootDir1 : rootBase;
  try {
    return expandTemplate(
      title,
      { rootBase, rootDir1, rootDir2, rootDir3, folderName },
      true,
    );
  } catch (_: unknown) {
    return '';
  }
}

function getDefaultTitle() {
  const config = workspace.getConfiguration();
  const data = config.inspect('window.title')!;
  return (data.globalValue ?? data.defaultValue) as string;
}

async function parseFolderTitle(root: string) {
  const filePath = nodejs.path.join(root, '.vscode', 'settings.json');
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const settings = await parseJsonFileAsync(filePath);
    return expandTitle(
      root,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((settings as any)['window.title'] ?? getDefaultTitle()) as string,
    );
  } catch (err: unknown) {
    log.debug(`Error parsing ${filePath}: ${err}`);
    return nodejs.path.basename(root);
  }
}

async function parseWorkspaceTitle(root: string) {
  try {
    const settings = await parseJsonFileAsync(root);
    return expandTitle(
      root,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (settings as any).settings['window.title'] as string,
    );
  } catch (err: unknown) {
    log.debug(`Error parsing ${root}: ${err}`);
    return nodejs.path.basename(nodejs.path.dirname(root));
  }
}

interface Item extends QuickPickItem {
  path: string;
}

async function parseTitle(path: string) {
  const stat = await workspace.fs.stat(Uri.file(path));
  switch (stat.type) {
    case FileType.Directory:
      return {
        title: await parseFolderTitle(path),
        isWorkspace: false,
      };
    case FileType.File:
    case FileType.SymbolicLink:
      return { title: await parseWorkspaceTitle(path), isWorkspace: true };
    default:
      throw new Error('Workspace is not workspace folder nor .code-workspace');
  }
}

async function toItem(path: string): Promise<Item> {
  const { title, isWorkspace } = await parseTitle(path);
  const icon = isWorkspace ? 'folder-library' : 'folder';
  const label = `$(${icon}) ${title}`;
  const button: QuickInputButton = {
    iconPath: new ThemeIcon('close'),
    tooltip: 'Remove from history',
  };
  return { path, label, description: path, buttons: [button] };
}

async function openFromHistory(newWindow: boolean) {
  const history: string[] = extContext.globalState.get(PERSISTENT_KEY, []);
  const removedItems: string[] = [];
  const current = getWorkspaceFile();
  const qp = window.createQuickPick<Item>();
  qp.items = await mapAsyncNoThrow(
    history.filter((file) => file !== current),
    toItem,
  );
  qp.matchOnDescription = true;
  qp.placeholder = newWindow ? 'Open in NEW window' : 'Open in SAME window';
  qp.onDidTriggerItemButton((event: QuickPickItemButtonEvent<Item>) => {
    const path = event.item.path;
    log.debug(`Removing ${path} from folders/workspaces history`);
    history.removeFirst(path);
    removedItems.push(path);
    qp.items = qp.items.filter((item) => item !== event.item);
  });
  const selected = await showQuickPick(qp);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!removedItems.isEmpty) {
    const ok = await window.showWarningMessage(
      'Do you really want to remove from history?',
      { modal: true, detail: removedItems.join('\n') },
      'Ok',
    );
    if (ok) {
      await extContext.globalState.update(PERSISTENT_KEY, history);
    }
  }
  if (selected) {
    await openFolder(qp.selectedItems[0].path, newWindow);
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.openRecent.sameWindow', async () =>
      openFromHistory(false),
    ),
    registerAsyncCommandWrapped('qcfg.openRecent.newWindow', async () =>
      openFromHistory(true),
    ),
  );

  extContext = context;
  const wsFile = getWorkspaceFile();
  if (!wsFile) return;
  const globalState = extContext.globalState;
  const history: string[] = globalState.get(PERSISTENT_KEY, []);
  history.removeFirst(wsFile);
  history.unshift(wsFile);
  handleStd(() => globalState.update(PERSISTENT_KEY, history));
}

Modules.register(activate);
