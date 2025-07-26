import { PersistentState } from "@sergei-dyshel/vscode";
import type { OpenDialogOptions, SaveDialogOptions } from "vscode";
import { Uri, window } from "vscode";

export async function showPersistentOpenDialog(
  persistentKey: string,
  options?: OpenDialogOptions,
): Promise<Uri | undefined>;

export async function showPersistentOpenDialog(
  persistentKey: string,
  options?: OpenDialogOptions & { canSelectFiles: true },
): Promise<Uri[] | undefined>;

export async function showPersistentOpenDialog(
  persistentKey: string,
  options?: OpenDialogOptions,
): Promise<Uri[] | Uri | undefined> {
  const state = new PersistentState<string | undefined>(
    persistentKey,
    undefined,
  );
  const uri = state.get();
  if (uri) {
    if (!options) options = {};
    options.defaultUri = Uri.file(uri);
  }

  const selected = await window.showOpenDialog(options);
  if (!options?.canSelectMany && selected && !selected.isEmpty) {
    await state.update(selected[0].fsPath);
    return selected[0];
  }
  /* TODO: figure out persistence for multi-select */
  return selected;
}

export async function showPersistentSaveDialog(
  persistentKey: string,
  options?: SaveDialogOptions,
): Promise<Uri | undefined> {
  const state = new PersistentState<string | undefined>(
    persistentKey,
    undefined,
  );
  const uri = state.get();
  if (uri) {
    options = { defaultUri: Uri.file(uri), ...options };
  }
  const selected = await window.showSaveDialog(options);
  if (selected) {
    await state.update(selected.fsPath);
  }
  return selected;
}
