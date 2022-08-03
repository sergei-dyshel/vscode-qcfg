import * as nodejs from '../../library/nodejs';

import { commands, window } from 'vscode';
import type { ExtensionJSON } from '../../library/extensionManifest';
import { readFile, writeFile } from '../../library/filesystemNodejs';
import { formatString } from '../../library/stringUtils';
import { registerCommandWrapped } from '../modules/exception';
import { extensionContext } from './extensionContext';

export interface UserCommandKeybinding {
  key: string;
  when?: string;
}

export interface UserCommand {
  command: string;
  title: string;
  keybinding?: UserCommandKeybinding;
  callback: () => void | Promise<void>;
}

/**
 * Register new user-facing command and optionally a keybinding for it.
 */
export function registerUserCommand(cmd: UserCommand) {
  packageJson.contributes!.commands!.push({
    command: cmd.command,
    category: 'qcfg',
    title: cmd.title,
  });
  if (cmd.keybinding) {
    packageJson.contributes!.keybindings!.push({
      command: cmd.command,
      key: cmd.keybinding.key.replaceAll('cmd+', 'ctrl+'),
      mac: cmd.keybinding.key.replaceAll('ctrl+', 'cmd+'),
      when: cmd.keybinding.when,
    });
  }
  return registerCommandWrapped(cmd.command, cmd.callback);
}

/**
 * Auto-generate manifest file with user commands and keybindings.
 */
export async function updateContributedCommands() {
  const path = nodejs.path.join(
    extensionContext().extensionPath,
    'package',
    'commands.json',
  );
  const prevContents = await readFile(path);
  const prevJson = JSON.parse(
    prevContents.toString(),
  ) as ExtensionJSON.Manifest;
  const newContents = JSON.stringify(packageJson, undefined, 2);
  if (prevContents.toString() !== newContents) {
    await writeFile(path, newContents);
    const diff = formatString(
      '{} -> {} commands, {} -> {} keybindings',
      prevJson.contributes!.commands!.length.toString(),
      packageJson.contributes!.commands!.length.toString(),
      prevJson.contributes!.keybindings!.length.toString(),
      packageJson.contributes!.keybindings!.length.toString(),
    );
    const answer = await window.showInformationMessage(
      `Updated auto-generated commands (${diff}), now rebuild the extension`,
      'Exit',
    );
    if (answer === 'Exit')
      await commands.executeCommand('workbench.action.quit');
  }
}

const packageJson: ExtensionJSON.Manifest = {
  contributes: { commands: [], keybindings: [] },
};
