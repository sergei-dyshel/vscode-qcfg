import type { WorkspaceFolder } from 'vscode';
import { Uri } from 'vscode';
import { FileSystemError, workspace } from 'vscode';
import { filterAsync } from '../modules/async';
import * as nodejs from '../../library/nodejs';

export async function uriExists(uri: Uri) {
  try {
    await workspace.fs.stat(uri);
    return true;
  } catch (err: unknown) {
    if (err instanceof FileSystemError && err.code === 'FileNotFound')
      return false;
    throw err;
  }
}

export async function getValidWorkspaceFolders(): Promise<
  readonly WorkspaceFolder[] | undefined
> {
  if (!workspace.workspaceFolders) return undefined;
  return filterAsync(
    workspace.workspaceFolders,
    async (folder: WorkspaceFolder) => uriExists(folder.uri),
  );
}

export function getWorkspaceRoot(): string | undefined {
  const folders = workspace.workspaceFolders;
  if (!folders || folders.isEmpty) return undefined;
  return folders[0].uri.fsPath;
}

/**
 * If uri is symlink to another file in workspace, resolve it
 *
 * Works for local filesystem only
 */
export async function workspaceResolveSymlink(uri: Uri) {
  if (uri.scheme !== 'file') return uri;
  if (!(await uriExists(uri))) return uri;
  let path = uri.fsPath;
  path = await nodejs.fsPromises.realpath(path);

  const newUri = Uri.file(path);
  return workspace.getWorkspaceFolder(newUri) ? newUri : uri;
}
