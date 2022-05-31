import type { Uri, WorkspaceFolder } from 'vscode';
import { FileSystemError, workspace } from 'vscode';
import { filterAsync } from '../modules/async';

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
