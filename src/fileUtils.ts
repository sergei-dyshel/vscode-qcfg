'use strict';

/* REFACTOR: import specific stuff from vscode */
import * as vscode from 'vscode';
import * as nodejs from './nodejs';

import * as glob from 'glob';
import * as chokidar from 'chokidar';

import { log } from './logging';
import { getActiveTextEditor, DisposableLike } from './utils';

export const globSync = glob.sync;
// tslint:disable-next-line: no-unnecessary-type-assertion
export const globAsync = nodejs.util.promisify(require('glob')) as (
  pattern: string,
  options?: glob.IOptions,
) => Promise<string[]>;

export function getDocumentRoot(fileName: string) {
  const wsPath = vscode.workspace.asRelativePath(fileName, true);
  const relativePath = vscode.workspace.asRelativePath(fileName, false);
  const [wsDir] = wsPath.split(nodejs.path.sep, 1);
  for (const workspaceFolder of vscode.workspace.workspaceFolders || []) {
    if (workspaceFolder.name === wsDir)
      return { workspaceFolder, relativePath };
  }
  return;
}

export function getDocumentRootThrowing(fileName: string) {
  return log.assertNonNull(
    getDocumentRoot(fileName),
    `Could not get workspace folder of ${fileName}`,
  );
}

export function getDocumentWorkspaceFolder(fileName: string) {
  const docRoot = getDocumentRoot(fileName);
  return docRoot ? docRoot.workspaceFolder : undefined;
}

// tslint:disable-next-line: deprecation
export const exists = nodejs.util.promisify(nodejs.fs.exists);
export const realPath = nodejs.util.promisify(nodejs.fs.realpath);

export function existsInRoot(
  wsFolder: vscode.WorkspaceFolder,
  fileName: string,
) {
  return exists(nodejs.path.join(wsFolder.uri.fsPath, fileName));
}

/**
 * Show peek dialog in case of multiple location or jump to the only
 * location (optionally search for tag in the line)
 */
export async function peekLocation(
  locations: vscode.Location[],
  tagForSingle?: string,
) {
  if (locations.length === 1) {
    const loc = locations[0];
    if (loc.range.isEmpty && tagForSingle)
      await openTagLocation(loc.uri.fsPath, {
        line: loc.range.start.line + 1,
        tag: tagForSingle,
      });
    else
      await vscode.window.showTextDocument(loc.uri, { selection: loc.range });
    return;
  }
  const editor = getActiveTextEditor();
  await vscode.commands.executeCommand(
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
  const line0 = options && options.line ? options.line - 1 : 0;
  let col0 = options && options.column ? options.column - 1 : 0;

  const editor = vscode.window.activeTextEditor;
  const mustOpenNewEditor = !editor || editor.document.uri.fsPath !== filePath;
  const document = mustOpenNewEditor
    ? await vscode.workspace.openTextDocument(filePath)
    : log.assertNonNull(editor).document;

  if (options && options.tag) {
    log.assertNull(options.column, 'Can not specify tag and column together');
    log.assertNonNull(options.line, 'Can not specify "tag" without "line"');
    const lineText = document.lineAt(line0);
    col0 = lineText.text.indexOf(options.tag);
    if (col0 === -1) {
      log.error(
        `Tag '${options.tag}' not found in ${filePath}:${options.line}`,
      );
      col0 = 0;
    }
  }
  const pos = new vscode.Position(line0, col0);
  const selection = new vscode.Selection(pos, pos);
  if (mustOpenNewEditor) {
    const viewColumn: vscode.ViewColumn | undefined = editor
      ? editor.viewColumn
      : undefined;
    await vscode.window.showTextDocument(document, {
      viewColumn,
      selection,
    });
    return;
  }
  editor!.selection = selection;
  editor!.revealRange(editor!.selection);
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
  private watcher: chokidar.FSWatcher;
  constructor(
    private path: string,
    private callback: (event: FileWatcherEvent) => unknown,
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
    this.watcher.close();
  }
}
