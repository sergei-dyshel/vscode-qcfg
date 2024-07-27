import type { ExtensionContext } from "vscode";
import { FileType, Uri, workspace } from "vscode";
import { assert } from "../../library/exception";
import { fileExists } from "../../library/fileUtils";
import { Logger } from "../../library/logging";
import * as nodejs from "../../library/nodejs";
import { expandTemplate } from "../../library/stringUtils";
import { MessageDialog } from "../utils/messageDialog";
import { PersistentState } from "../utils/persistentState";
import { GenericQuickPick, QuickPickButtons } from "../utils/quickPick";
import { openFolder } from "../utils/window";
import { mapAsyncNoThrow } from "./async";
import { registerAsyncCommandWrapped } from "./exception";
import { parseJsonFileAsync } from "./json";
import { Modules } from "./module";

const persistentState = new PersistentState<string[]>("workspaceHistory", []);

const log = new Logger({ name: "workspaceHistory" });

const WINDOW_TITLE = "window.title";
/**
 * Workspace file path or folder path if single folder is opened, `undefined`
 * otherwise
 */
export function getWorkspaceFile(): string | undefined {
  if (workspace.workspaceFile) {
    if (workspace.workspaceFile.scheme === "untitled") {
      log.debug("Opened untitled project");
      return undefined;
    }
    log.debug("Opened workspace", workspace.workspaceFile.fsPath);
    return workspace.workspaceFile.fsPath;
  }
  if (workspace.workspaceFolders) {
    assert(workspace.workspaceFolders.length === 1);
    log.debug(
      "Opened workspace folder",
      workspace.workspaceFolders[0].uri.fsPath,
    );
    return workspace.workspaceFolders[0].uri.fsPath;
  }
  return undefined;
}

export function getWorkspaceName(): string | undefined {
  const wsFile = getWorkspaceFile();
  if (!wsFile) return undefined;
  const title = workspace.getConfiguration().get<string>(WINDOW_TITLE);
  if (!title) return undefined;
  return expandTitle(wsFile, title);
}

function expandTitle(root: string, title: string): string {
  const isWorkspace = nodejs.path.extname(root) === ".code-workspace";
  const rootBase = nodejs.path.basename(root, ".code-workspace");
  const rootDir1 = nodejs.path.basename(nodejs.path.dirname(root));
  const folderName = isWorkspace ? rootDir1 : rootBase;
  try {
    return expandTemplate(title, { folderName }, true);
  } catch {
    return "";
  }
}

function getDefaultTitle() {
  const config = workspace.getConfiguration();
  const data = config.inspect(WINDOW_TITLE)!;
  return (data.globalValue ?? data.defaultValue) as string;
}

async function parseFolderTitle(root: string) {
  const filePath = nodejs.path.join(root, ".vscode", "settings.json");
  if (!(await fileExists(filePath))) {
    return nodejs.path.basename(root);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const settings = await parseJsonFileAsync(filePath);
    return expandTitle(
      root,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((settings as any)[WINDOW_TITLE] ?? getDefaultTitle()) as string,
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
      (settings as any).settings[WINDOW_TITLE] as string,
    );
  } catch (err: unknown) {
    log.debug(`Error parsing ${root}: ${err}`);
    return nodejs.path.basename(nodejs.path.dirname(root));
  }
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
      throw new Error("Workspace is not workspace folder nor .code-workspace");
  }
}

async function toItem(path: string) {
  const { title, isWorkspace } = await parseTitle(path);
  const icon = isWorkspace ? "folder-library" : "folder";
  const label = `$(${icon}) ${title}`;
  return [path, label] as const;
}

async function openFromHistory(newWindow: boolean) {
  const history = persistentState.get();
  const removedItems: string[] = [];
  const current = getWorkspaceFile();
  const allItems = await mapAsyncNoThrow(history, toItem);
  if (allItems.length < history.length) {
    await persistentState.update(allItems.map(([path, _label]) => path));
    log.info(`Removed ${history.length - allItems.length} items`);
  }
  const items = allItems.filter(([path, _label]) => path !== current);

  const qp = new GenericQuickPick<readonly [path: string, label: string]>(
    ([path, label]) => ({ label, description: path }),
  );
  qp.options.matchOnDescription = true;
  qp.options.placeholder = newWindow
    ? "Open in NEW window"
    : "Open in SAME window";
  qp.addCommonItemButton(QuickPickButtons.REMOVE, ([path, _label]) => {
    log.debug(`Removing ${path} from folders/workspaces history`);
    history.removeFirst(path);
    removedItems.push(path);
    qp.items = qp
      .itemsWithoutSeparators()
      .filter(([path1, _label1]) => path1 !== path);
  });
  qp.items = items;

  const selected = await qp.select();
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (!removedItems.isEmpty) {
    const ok = await MessageDialog.showModal(
      MessageDialog.WARNING,
      ["Do you really want to remove from history?", removedItems.join("\n")],
      ["Ok"] as const,
    );
    if (ok) {
      await persistentState.update(history);
    }
  }
  if (selected) {
    await openFolder(selected[0], newWindow);
  }
}

async function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.openRecent.sameWindow", async () =>
      openFromHistory(false),
    ),
    registerAsyncCommandWrapped("qcfg.openRecent.newWindow", async () =>
      openFromHistory(true),
    ),
  );

  const wsFile = getWorkspaceFile();
  if (!wsFile) return;
  const history = persistentState.get();
  history.removeFirst(wsFile);
  history.unshift(wsFile);
  await persistentState.update(history);
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
Modules.register(activate);
