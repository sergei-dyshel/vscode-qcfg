import type { ExtensionContext } from "vscode";
import { env, FileType, Uri, window, workspace } from "vscode";
import { assertNotNull } from "../../library/exception";
import { mkdir, readFile, writeFile } from "../../library/filesystemNodejs";
import type { JsonTypes } from "../../library/json";
import { log } from "../../library/logging";
import * as nodejs from "../../library/nodejs";
import { numberCompare } from "../../library/tsUtils";
import {
  getMemento,
  getStoragePath,
  PersistentScope,
} from "../utils/persistentState";
import { StringQuickPick } from "../utils/quickPick";
import { PersistentStringQuickPick } from "../utils/quickPickPersistent";
import { mapAsync, mapSomeAsyncAndZip } from "./async";
import { documentRange } from "./documentUtils";
import { handleAsyncStd, registerCommandWrapped } from "./exception";
import { Modules } from "./module";

const BACKUP_COPIES_TO_KEEP = 100;

async function browsePersistentState(scope: PersistentScope) {
  const memento = getMemento(scope);

  const qp = new StringQuickPick(memento.keys());
  qp.options.title = `Browsing ${scope} persistent storage, press ENTER to show JSON, ESC to exit`;
  qp.options.ignoreFocusOut = true;
  await qp.showOnly(async (key: string) => {
    const activeEditor = window.activeTextEditor;
    const document =
      activeEditor?.document.isUntitled &&
      activeEditor.document.languageId === "json"
        ? activeEditor.document
        : await workspace.openTextDocument({ language: "json" });
    const data = JSON.stringify(memento.get(key), undefined, 4);
    const editor = await window.showTextDocument(document, {
      preserveFocus: true,
    });
    await editor.edit((edit) => {
      edit.replace(documentRange(document), data);
    });
    editor.selection = document.positionAt(0).asRange.asSelection();
  });
}

function getBackupJson(scope: PersistentScope) {
  const memento = getMemento(scope);
  const json: Record<string, JsonTypes.Any> = {};
  for (const key of memento.keys()) json[key] = memento.get(key)!;
  return json;
}

function getBackupDir(scope: PersistentScope) {
  const DIR_NAME = "persistent-state";
  const storagePath = getStoragePath(scope);
  assertNotNull(storagePath);
  return nodejs.path.join(storagePath, DIR_NAME);
}

async function backupPersistentState(scope: PersistentScope) {
  const backupDir = getBackupDir(scope);
  await mkdir(backupDir, { recursive: true });
  const filename = nodejs.path.join(
    backupDir,
    new Date().toISOString() + ".json",
  );
  const backup = JSON.stringify(getBackupJson(scope), undefined, 4);
  await writeFile(filename, backup);

  log.debug(`Backed up ${scope} persistent state to ${filename}`);

  // get list of all files in backup dir
  const directory = await workspace.fs.readDirectory(Uri.file(backupDir));
  const files = directory.filter(([_name, type_]) => type_ === FileType.File);

  // sort by creation time
  const filesStat = await mapSomeAsyncAndZip(
    files.map(([name, _type]) => name),
    async (name) => {
      const fullName = nodejs.path.join(backupDir, name);
      return workspace.fs.stat(Uri.file(fullName));
    },
  );
  filesStat.sort(([_name1, stat1], [_name2, stat2]) =>
    numberCompare(stat1.ctime, stat2.ctime),
  );

  // delete old backups
  if (filesStat.length > BACKUP_COPIES_TO_KEEP) {
    const filesToDelete = filesStat
      .slice(0, filesStat.length - BACKUP_COPIES_TO_KEEP)
      .map(([path, _]) => path);
    await mapAsync(filesToDelete, async (path) =>
      workspace.fs.delete(Uri.file(nodejs.path.join(backupDir, path))),
    );
    log.debug("Deleted old backups", filesToDelete);
  }
}

async function restorePersistentState(scope: PersistentScope) {
  const backupDir = getBackupDir(scope);

  const selected = await window.showOpenDialog({
    defaultUri: Uri.file(backupDir),
  });

  if (!selected) return;

  const backupFile = selected[0].fsPath;
  const fileData = await readFile(backupFile);
  const data = JSON.parse(fileData.toString()) as Record<string, JsonTypes.Any>;

  const qp = new PersistentStringQuickPick(
    "persistent.restoreBackup." + scope,
    Object.keys(data),
  );
  qp.options.title = "Select keys to restore";
  qp.options.canSelectMany = true;
  const keys = await qp.selectMany();
  if (!keys) return;

  const memento = getMemento(scope);
  for (const key of keys) await memento.update(key, data[key]);
  log.info("Restored persistent keys", keys);
}

async function openStorageDirectory(scope: PersistentScope) {
  const path = getStoragePath(scope)!;
  assertNotNull(path);
  await env.openExternal(Uri.file(path));
}

function activate(context: ExtensionContext) {
  handleAsyncStd(backupPersistentState(PersistentScope.GLOBAL));
  context.subscriptions.push(
    registerCommandWrapped("qcfg.persistent.browseGlobal", async () =>
      browsePersistentState(PersistentScope.GLOBAL),
    ),
    registerCommandWrapped("qcfg.persistent.browseWorkspace", async () =>
      browsePersistentState(PersistentScope.WORKSPACE),
    ),
    registerCommandWrapped("qcfg.persistent.backupGlobal", async () =>
      backupPersistentState(PersistentScope.GLOBAL),
    ),
    registerCommandWrapped("qcfg.persistent.openGlobalStorage", async () =>
      openStorageDirectory(PersistentScope.GLOBAL),
    ),
    registerCommandWrapped("qcfg.persistent.restoreGlobal", async () =>
      restorePersistentState(PersistentScope.GLOBAL),
    ),
  );
}

Modules.register(activate);
