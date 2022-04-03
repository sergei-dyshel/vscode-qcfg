import { commands, Uri } from 'vscode';

export async function FocusProblemsView() {
  return commands.executeCommand('workbench.action.problems.focus');
}

export async function openFolder(path: string, newWindow: boolean) {
  return commands.executeCommand(
    'vscode.openFolder',
    Uri.file(path),
    newWindow,
  );
}
