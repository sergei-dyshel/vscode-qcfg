import { commands } from 'vscode';

export async function FocusProblemsView() {
  return commands.executeCommand('workbench.action.problems.focus');
}
