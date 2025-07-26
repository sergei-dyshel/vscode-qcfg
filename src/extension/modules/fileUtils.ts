import type { DisposableLike } from "@sergei-dyshel/vscode";
import { QuickPickLocations, getActiveTextEditor } from "@sergei-dyshel/vscode";
import * as tempy from "tempy";
import type { Location, Uri, ViewColumn, WorkspaceFolder } from "vscode";
import {
  Position,
  Range,
  Selection,
  commands,
  window,
  workspace,
} from "vscode";
import type { default as Watcher } from "watcher" with { "resolution-mode": "require" };
import { assertNotNull, assertNull } from "../../library/exception";
import { fileExists } from "../../library/fileUtils";
import { log } from "../../library/logging";
import * as nodejs from "../../library/nodejs";
import { documentRangePreview } from "../utils/document";
import { setMapAsync } from "./async";

// exported from watcher/dist/types
type WatcherOptions = {
  debounce?: number;
  depth?: number;
  limit?: number;
  ignoreInitial?: boolean;
  native?: boolean;
  persistent?: boolean;
  pollingInterval?: number;
  pollingTimeout?: number;
  recursive?: boolean;
  renameDetection?: boolean;
  renameTimeout?: number;
};

export function getTempFile() {
  return tempy.file();
}

export function expandHome(path: string): string {
  if (path.startsWith("~/")) {
    return nodejs.path.join(process.env["HOME"]!, path.slice(2));
  }
  return path;
}

export function getWorkspaceFolderByName(
  name: string,
): WorkspaceFolder | undefined {
  assertNotNull(workspace.workspaceFolders, "No workspace folders");
  for (const folder of workspace.workspaceFolders) {
    if (folder.name === name) return folder;
  }
  return undefined;
}

export function realPathSync(path: string): string {
  return nodejs.fs.realpathSync(path);
}

export async function existsInRoot(
  wsFolder: WorkspaceFolder,
  fileName: string,
) {
  return fileExists(nodejs.path.join(wsFolder.uri.fsPath, fileName));
}

/**
 * Show peek dialog in case of multiple location or jump to the only location
 * (optionally search for tag in the line)
 */
export async function peekLocations(locations: Location[]) {
  if (locations.length === 1) {
    const loc = locations[0];
    const start = loc.range.start;
    const selection = new Range(start, start);
    await window.showTextDocument(loc.uri, { selection });
    return;
  }
  const editor = getActiveTextEditor();
  await commands.executeCommand(
    "editor.action.showReferences",
    editor.document.uri,
    editor.selection.active,
    locations,
  );
}

export async function quickPickLocations(locations: readonly Location[]) {
  const documents = await setMapAsync(
    new Set<Uri>(locations.map((loc) => loc.uri)),
    (uri) => workspace.openTextDocument(uri),
  );

  const qp = new QuickPickLocations<Location>(
    (loc) => ({
      label: documentRangePreview(
        documents.get(loc.uri)!,
        loc.range,
        8 /* prefixLen */,
        8 /* suffixLen */,
      )[0],
    }),
    (loc) => loc,
    locations,
  );
  qp.adjustActiveItem();
  await qp.select();
}

export async function openTagLocation(
  filePath: string,
  options: { line?: number; column?: number; tag?: string },
) {
  const line0 = options.line ? options.line - 1 : 0;
  let col0 = options.column ? options.column - 1 : 0;

  const editor = window.activeTextEditor;
  const mustOpenNewEditor = !editor || editor.document.uri.fsPath !== filePath;
  const document = mustOpenNewEditor
    ? await workspace.openTextDocument(filePath)
    : editor.document;

  if (options.tag) {
    assertNull(options.column, "Can not specify tag and column together");
    assertNotNull(options.line, 'Can not specify "tag" without "line"');
    const lineText = document.lineAt(line0);
    col0 = lineText.text.indexOf(options.tag);
    if (col0 === -1) {
      log.error(
        `Tag '${options.tag}' not found in ${filePath}:${options.line}`,
      );
      col0 = 0;
    }
  }
  const pos = new Position(line0, col0);
  const selection = new Selection(pos, pos);
  if (mustOpenNewEditor) {
    const viewColumn: ViewColumn | undefined = editor
      ? editor.viewColumn
      : undefined;
    await window.showTextDocument(document, {
      viewColumn,
      selection,
    });
    return;
  }
  editor.selection = selection;
  editor.revealRange(editor.selection);
}

export enum FileWatcherEvent {
  CREATED,
  CHANGED,
  DELETED,
}

export class FileWatcher implements DisposableLike {
  private constructor(
    private readonly watcher: Watcher,
    private readonly path: string,
    private readonly callback: (event: FileWatcherEvent) => unknown,
  ) {
    this.watcher.on("all", this.onEvent.bind(this));
  }

  static async create(
    path: string,
    callback: (event: FileWatcherEvent) => unknown,
    options?: WatcherOptions,
  ) {
    const module = await import("watcher");
    const watcher = new module.default(path, {
      persistent: true,
      ignoreInitial: true,
      ...options,
    });
    return new FileWatcher(watcher, path, callback);
  }

  private onEvent(eventName: string) {
    switch (eventName) {
      case "change":
        this.callback(FileWatcherEvent.CHANGED);
        return;
      case "add":
        this.callback(FileWatcherEvent.CREATED);
        return;
      case "unlink":
        this.callback(FileWatcherEvent.DELETED);
        return;
      default:
        throw new Error(
          `Unsupported event name "${eventName}" for file "${this.path}"`,
        );
    }
  }

  dispose() {
    this.watcher.close();
  }
}
