import * as nodejs from '../../library/nodejs';

import { window } from 'vscode';
import type { ExtensionJSON } from '../../library/extensionManifest';
import { readFile, writeFile } from '../../library/filesystemNodejs';
import { formatString } from '../../library/stringUtils';
import { registerCommandWrapped } from '../modules/exception';
import { extensionContext } from './extensionContext';

/**
 * Register new user-facing command and optionally a keybinding for it.
 */
export function registerUserCommand(
  command: string,
  title: string,
  options: { key: string; when?: string } | Record<string, never>,
  callback: () => void | Promise<void>,
) {
  packageJson.contributes!.commands!.push({
    command,
    title,
  });
  if ('key' in options) {
    packageJson.contributes!.keybindings!.push({
      command,
      key: options.key.replaceAll('cmd+', 'ctrl+'),
      mac: options.key.replaceAll('ctrl+', 'cmd+'),
      when: options.when,
    });
  }
  return registerCommandWrapped(command, callback);
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
    await window.showInformationMessage(
      `Updated auto-generated commands (${diff}), now rebuild the extension`,
    );
  }
}

const packageJson: ExtensionJSON.Manifest = {
  contributes: { commands: [], keybindings: [] },
};
