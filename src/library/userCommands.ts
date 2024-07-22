import type { ExtensionJSON } from './extensionManifest';

export namespace UserCommands {
  export type Keybinding =
    | {
        key: string;
        when?: string;
      }
    | string;

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
          ...generateKeybinding(cmd.keybinding),
        });
      }
    }
    return json;
  }

  function generateKeybinding(binding: Keybinding) {
    const key = typeof binding === 'string' ? binding : binding.key;
    const when = typeof binding === 'string' ? undefined : binding.when;
    return {
      key: key.replaceAll('cmd+', 'ctrl+'),
      mac: key.replaceAll('ctrl+', 'cmd+'),
      when,
    };
  }
}
