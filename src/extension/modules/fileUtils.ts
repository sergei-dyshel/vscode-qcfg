'use strict';

import * as chokidar from 'chokidar';
import * as glob from 'glob';
import * as tempy from 'tempy';
import type { Location, ViewColumn, WorkspaceFolder } from 'vscode';
import {
  commands,
  Position,
  Range,
  Selection,
  window,
  workspace,
} from 'vscode';
import { assertNotNull, assertNull } from '../../library/exception';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import type { DisposableLike } from '../../library/types';
import { handleAsyncStd } from './exception';
import { getActiveTextEditor } from './utils';

export const globSync = glob.sync;
export const globAsync: (
  pattern: string,
  options?: glob.IOptions,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
) => Promise<string[]> = nodejs.util.promisify(require('glob'));

export function getTempFile() {
  return tempy.file();
}

export function expandHome(path: string): string {
  if (path.startsWith('~/')) {
    return nodejs.path.join(process.env['HOME']!, path.slice(2));
  }
  return path;
}

export function getDocumentRoot(fileName: string) {
  const wsPath = workspace.asRelativePath(fileName, true);
  const relativePath = workspace.asRelativePath(fileName, false);
  const [wsDir] = wsPath.split(nodejs.path.sep, 1);
  for (const workspaceFolder of workspace.workspaceFolders ?? []) {
    if (workspaceFolder.name === wsDir)
      return { workspaceFolder, relativePath };
  }
  return;
}

export function getDocumentRootThrowing(fileName: string) {
  const root = getDocumentRoot(fileName);
  assertNotNull(root, `Could not get workspace folder of ${fileName}`);
  return root;
}

export function getDocumentWorkspaceFolder(fileName: string) {
  const docRoot = getDocumentRoot(fileName);
  return docRoot ? docRoot.workspaceFolder : undefined;
}

export function getWorkspaceFolderByName(
  name: string,
): WorkspaceFolder | undefined {
  assertNotNull(workspace.workspaceFolders, 'No workspace folders');
  for (const folder of workspace.workspaceFolders) {
    if (folder.name === name) return folder;
  }
  return undefined;
}

export const exists = nodejs.util.promisify(nodejs.fs.exists);
export const realPath = nodejs.util.promisify(nodejs.fs.realpath);

export async function existsInRoot(
  wsFolder: WorkspaceFolder,
  fileName: string,
) {
  return exists(nodejs.path.join(wsFolder.uri.fsPath, fileName));
}

/**
 * Show peek dialog in case of multiple location or jump to the only
 * location (optionally search for tag in the line)
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
    'editor.action.showReferences',
    editor.document.uri,
    editor.selection.active,
    locations,
  );
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
    assertNull(options.column, 'Can not specify tag and column together');
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

/**
 * Watch file and call callback on when it is created/deleted/changed
 */
export function watchFile(
  path: string,
  callback: (event: FileWatcherEvent) => unknown,
): DisposableLike {
  return new FileWatcher(path, callback);
}

class FileWatcher implements DisposableLike {
  private readonly watcher: chokidar.FSWatcher;
  constructor(
    private readonly path: string,
    private readonly callback: (event: FileWatcherEvent) => unknown,
  ) {
    this.watcher = chokidar.watch(path, {
      persistent: true,
      ignoreInitial: true,
      followSymlinks: true,
      usePolling: false,
    });
    this.watcher.on('all', this.onEvent.bind(this));
  }

  private onEvent(eventName: string) {
    switch (eventName) {
      case 'change':
        this.callback(FileWatcherEvent.CHANGED);
        return;
      case 'add':
        this.callback(FileWatcherEvent.CREATED);
        return;
      case 'unlink':
        this.callback(FileWatcherEvent.DELETED);
        return;
      default:
        throw new Error(
          `Unsupported event name "${eventName}" for file "${this.path}"`,
        );
    }
  }

  dispose() {
    handleAsyncStd(this.watcher.close());
  }
}
