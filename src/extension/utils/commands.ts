import { commands, window } from 'vscode';
import type { DisposableLike } from '../../library/disposable';
import type { ExtensionJSON } from '../../library/extensionManifest';
import { readFile } from '../../library/filesystemNodejs';
import * as nodejs from '../../library/nodejs';
import { formatString } from '../../library/stringUtils';
import { UserCommands } from '../../library/userCommands';
import { extensionContext } from './extensionContext';

/**
 * Auto-generate manifest file with user commands and keybindings.
 */
export async function verifyCommandsJson() {
  const path = nodejs.path.join(
    extensionContext().extensionPath,
    UserCommands.JSON_PATH,
  );
  const prevContents = await readFile(path);
  const prevJson = JSON.parse(
    prevContents.toString(),
  ) as ExtensionJSON.Manifest;
  const newJson = UserCommands.generateJson();
  const newContents = JSON.stringify(newJson, undefined, 2);
  if (prevContents.toString() !== newContents) {
    const diff = formatString(
      '{} -> {} commands, {} -> {} keybindings',
      prevJson.contributes!.commands!.length.toString(),
      newJson.contributes!.commands!.length.toString(),
      prevJson.contributes!.keybindings!.length.toString(),
      newJson.contributes!.keybindings!.length.toString(),
    );
    const answer = await window.showErrorMessage(
      `Auto-generated commands not up-to-date (${diff})`,
      'Exit',
    );
    if (answer === 'Exit')
      await commands.executeCommand('workbench.action.quit');
  }
}

export function registerAllCommands(): DisposableLike[] {
  return UserCommands.all.map((cmd) =>
    commands.registerCommand(cmd.command, cmd.callback),
  );
}
