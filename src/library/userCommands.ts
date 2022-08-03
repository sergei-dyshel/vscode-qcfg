import type { ExtensionJSON } from './extensionManifest';
import * as nodejs from './nodejs';

export namespace UserCommands {
  export const JSON_PATH = nodejs.path.join('package', 'commands.json');

  export interface Keybinding {
    key: string;
    when?: string;
  }

  export interface Command {
    command: string;
    title: string;
    keybinding?: Keybinding;
    callback: () => void | Promise<void>;
  }

  /**
   * Register new user-facing command and optionally a keybinding for it.
   */
  export function register(...cmds: Command[]) {
    all.push(...cmds);
  }

  export const all: Command[] = [];

  export function generateJson(): ExtensionJSON.Manifest {
    const json: ExtensionJSON.Manifest = {
      contributes: { commands: [], keybindings: [] },
    };

    for (const cmd of all) {
      json.contributes!.commands!.push({
        command: cmd.command,
        category: 'qcfg',
        title: cmd.title,
      });
      if (cmd.keybinding) {
        json.contributes!.keybindings!.push({
          command: cmd.command,
          key: cmd.keybinding.key.replaceAll('cmd+', 'ctrl+'),
          mac: cmd.keybinding.key.replaceAll('ctrl+', 'cmd+'),
          when: cmd.keybinding.when,
        });
      }
    }
    return json;
  }
}
