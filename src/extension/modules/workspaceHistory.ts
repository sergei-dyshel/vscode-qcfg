'use strict';

import {
  ExtensionContext,
  workspace,
  QuickPickItem,
  commands,
  Uri,
  FileType,
} from 'vscode';
import { Modules } from './module';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { selectFromList } from './dialog';
import { registerAsyncCommandWrapped, handleStd } from './exception';
import { expandTemplate } from '../../library/stringUtils';
import { mapAsyncNoThrowAndZip } from './async';
import { parseJsonFileAsync } from './json';
import { assert } from '../../library/exception';

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
  } catch (_) {
    return '';
  }
}

function getDefaultTitle() {
  const config = workspace.getConfiguration();
  const data = config.inspect('window.title')!;
  return (data.globalValue ?? data.defaultValue) as string;
}

async function getWorkspaceConfig(root: string): Promise<string> {
  const stat = await workspace.fs.stat(Uri.file(root));
  switch (stat.type) {
    case FileType.Directory:
      {
        const filePath = nodejs.path.join(root, '.vscode', 'settings.json');
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const settings = (await parseJsonFileAsync(filePath)) as any;
          return expandTitle(
            root,
            settings['window.title'] ?? getDefaultTitle(),
          );
        } catch (err) {
          log.debug(`Error parsing ${filePath}: ${err}`);
          return nodejs.path.basename(root);
        }
      }
      break;
    case FileType.File:
    case FileType.SymbolicLink:
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const settings = (await parseJsonFileAsync(root)) as any;
        return expandTitle(root, settings.settings['window.title']);
      } catch (err) {
        log.debug(`Error parsing ${root}: ${err}`);
        return nodejs.path.basename(nodejs.path.dirname(root));
      }
      break;
    default:
      throw new Error('Workspace is not workspace folder nor .code-workspace');
  }
}

function toQuickPickItem(rootAndTitle: [string, string]): QuickPickItem {
  const [root, title] = rootAndTitle;
  return { label: title, description: root };
}

async function openFromHistory(newWindow: boolean) {
  const history: string[] = extContext.globalState.get(PERSISTENT_KEY, []);
  const current = getWorkspaceFile();
  const histWithTitles = await mapAsyncNoThrowAndZip(
    history.filter(file => file !== current),
    getWorkspaceConfig,
  );
  const rootAndTitle = await selectFromList(histWithTitles, toQuickPickItem, {
    matchOnDescription: true,
    placeHolder: newWindow ? 'Open in NEW window' : 'Open in SAME window',
  });
  if (!rootAndTitle) return;
  const [root] = rootAndTitle;
  await commands.executeCommand('vscode.openFolder', Uri.file(root), newWindow);
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
