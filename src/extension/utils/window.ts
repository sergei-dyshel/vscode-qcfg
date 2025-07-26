import type {
  TextDocument,
  TextDocumentShowOptions,
  TextEditor,
  ViewColumn,
} from "vscode";
import { commands, Uri, window } from "vscode";

export async function FocusProblemsView() {
  return commands.executeCommand("workbench.action.problems.focus");
}

/**
 * Open workspace/folder
 *
 * See
 * {@link https://github.com/sergei-dyshel/vscode/blob/78a1c2301661c322bac61f1db87d7c950705bedb/src/vs/workbench/browser/actions/workspaceCommands.ts#L167}
 * for details
 */
export async function openFolder(
  path: string | Uri,
  newWindow?:
    | boolean
    | {
        forceNewWindow?: boolean;
        forceReuseWindow?: boolean;
        noRecentEntry?: boolean;
        forceLocalWindow?: boolean;
        forceProfile?: string;
        forceTempProfile?: boolean;
      },
) {
  const uri = typeof path === "string" ? Uri.file(path) : path;
  return commands.executeCommand("vscode.openFolder", uri, newWindow);
}

export function getBesideViewColumn(): ViewColumn | undefined {
  const groups = window.tabGroups;
  if (groups.all.length > 1 && groups.activeTabGroup === groups.all[0]) {
    return groups.all[1].viewColumn;
  }
  return undefined;
}

let showTextDocumentGen = 0;

/**
 * Safe version of {@link window.showTextDocument}.
 *
 * When function is called repeately with overlapping invokation, the call may
 * fail because another editor is being open at the same time. If older
 * invokation (not the most recent one) failed we just abort (return
 * `undefined`). If newest invokation failed, we retry.
 */
export async function showTextDocument(
  docOrUri: TextDocument | Uri,
  options?: TextDocumentShowOptions,
): Promise<TextEditor | undefined> {
  // const column =
  //   options?.viewColumn ?? window.tabGroups.activeTabGroup.viewColumn;
  showTextDocumentGen += 1;
  const gen = showTextDocumentGen;
  try {
    if (docOrUri instanceof Uri)
      return await window.showTextDocument(docOrUri, options);
    return await window.showTextDocument(docOrUri, options);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("Could NOT open editor")) {
      if (gen !== showTextDocumentGen) return undefined;
      return showTextDocument(docOrUri, options);
    }
    throw err; // unrelated error
  }
}
