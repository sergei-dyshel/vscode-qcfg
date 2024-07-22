/* eslint-disable unicorn/escape-case */
/* eslint-disable unicorn/no-hex-escape */

import type { ExtensionJSON } from "../library/extensionManifest";

export function generateMacTermBindings() {
  const mapping = {
    "cmd+a": "\x01",
    "cmd+e": "\x05",
    "cmd+c": "\x03",
    "cmd+w": "\x17",
    "cmd+r": "\x12",
    "cmd+n": "\x0e",
    "cmd+p": "\x10",
    "cmd+u": "\x15",
    "cmd+shift+k": "\x0b",
    "alt+b": "\x1bb",
    "alt+f": "\x1bf",
  };

  const keybindings: ExtensionJSON.KeyBinding[] = [];

  for (const [key, code] of Object.entries(mapping)) {
    keybindings.push({
      key,
      command: "workbench.action.terminal.sendSequence",
      when: "terminalFocus && isMac",
      args: { text: code },
    });
  }

  const json: ExtensionJSON.Manifest = {
    contributes: { keybindings },
  };

  return json;
}
