import type { ViewColumn } from "vscode";
import { commands, window } from "vscode";

export async function FocusProblemsView() {
  return commands.executeCommand("workbench.action.problems.focus");
}

export function getBesideViewColumn(): ViewColumn | undefined {
  const groups = window.tabGroups;
  if (groups.all.length > 1 && groups.activeTabGroup === groups.all[0]) {
    return groups.all[1].viewColumn;
  }
  return undefined;
}
