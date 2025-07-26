import {
  getWindowTitle,
  getWorkspaceRoot,
  getWorkspaceRootName,
  PersistentState,
  RemoteEnv,
} from "@sergei-dyshel/vscode";
import { BuiltinIcon } from "@sergei-dyshel/vscode/icon";
import type { ExtensionContext } from "vscode";
import { workspace } from "vscode";
import { Logger } from "../../library/logging";
import { MessageDialog } from "../utils/messageDialog";
import { GenericQuickPick, QuickPickButtons } from "../utils/quickPick";
import { openFolder } from "../utils/window";
import { listenWrapped, registerAsyncCommandWrapped } from "./exception";
import { Modules } from "./module";

interface HistoryEntry {
  /** Path to workspace file or single folder */
  root: string;

  /** Custom title if present in `workspace.title` */
  title?: string;

  /** Remove environment in which workspace is opened */
  remote?: RemoteEnv;
}

const persistentState = new PersistentState<HistoryEntry[]>(
  "workspaceHistory.v2",
  [],
);

const log = new Logger({ name: "workspaceHistory" });

const WINDOW_TITLE = "window.title";

const WORKSPACE_FILE_EXTENSION = ".code-workspace";

/** History with given entry, ignores title when comparing */
function filterOutEntry(history: HistoryEntry[], entry?: HistoryEntry) {
  if (!entry) return [...history];
  return history.filter(
    (otherEntry) =>
      otherEntry.root !== entry.root ||
      !RemoteEnv.equal(otherEntry.remote, entry.remote),
  );
}

/** History entry for current workspace/folder, or `undefined` for untitled */
function getCurrentEntry(): HistoryEntry | undefined {
  const root = getWorkspaceRoot();
  if (!root) return undefined;
  return {
    root,
    remote: RemoteEnv.current(),
    title: getWindowTitle(),
  };
}

async function openFromHistory(newWindow: boolean) {
  const history = persistentState.get();
  const removedItems: HistoryEntry[] = [];
  const filteredHistory = filterOutEntry(history, getCurrentEntry());

  const qp = new GenericQuickPick<HistoryEntry>((entry) => ({
    iconPath: (entry.root.endsWith(WORKSPACE_FILE_EXTENSION)
      ? BuiltinIcon.FOLDER_LIBRARY
      : BuiltinIcon.FOLDER
    ).themeIcon,
    label:
      (entry.title ?? getWorkspaceRootName(entry.root)) +
      (entry.remote ? ` (${entry.remote.name})` : ""),
    description: entry.root,
  }));
  qp.options.placeholder = newWindow
    ? "Open in NEW window"
    : "Open in SAME window";
  qp.addCommonItemButton(QuickPickButtons.REMOVE, (entry) => {
    log.debug(`Removing ${entry.root} from folders/workspaces history`);
    filteredHistory.removeFirst(entry);
    history.removeFirst(entry);
    removedItems.push(entry);
    qp.items = filteredHistory;
  });
  qp.items = filteredHistory;

  const entry = await qp.select();
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

  if (entry) {
    const remote = entry.remote;
    await (remote
      ? openFolder(RemoteEnv.toRemoteUri(entry.root, remote), newWindow)
      : openFolder(entry.root, {
          forceNewWindow: newWindow,
          forceLocalWindow: true,
        }));
  }
}

async function updateHistory() {
  const curEntry = getCurrentEntry();
  if (!curEntry) return;

  log.info("Pushing item to top of workspace history", curEntry);
  const history = filterOutEntry(persistentState.get(), curEntry);
  history.unshift(curEntry);
  await persistentState.update(history);
}

async function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.openRecent.sameWindow", async () =>
      openFromHistory(false),
    ),
    registerAsyncCommandWrapped("qcfg.openRecent.newWindow", async () =>
      openFromHistory(true),
    ),
    listenWrapped(workspace.onDidChangeConfiguration, async (event) => {
      if (event.affectsConfiguration(WINDOW_TITLE)) {
        log.info("Window title updated");
        await updateHistory();
      }
    }),
  );

  await updateHistory();
}

// eslint-disable-next-line @typescript-eslint/no-misused-promises
Modules.register(activate);
