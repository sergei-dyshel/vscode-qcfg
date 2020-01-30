'use strict';

import { PackageJson, KeyBinding } from '../library/packageJson';

const mapping = {
  'cmd+a': '\x01',
  'cmd+e': '\x05',
  'cmd+c': '\x03',
  'cmd+w': '\x17',
  'cmd+r': '\x12',
  'cmd+n': '\x0e',
  'cmd+p': '\x10',
  'cmd+u': '\x15',
  'cmd+shift+k': '\x0b',
  'alt+b': '\x1bb',
  'alt+f': '\x1bf',
};

const keybindings: KeyBinding[] = [];

for (const [key, code] of Object.entries(mapping)) {
  keybindings.push({
    key,
    command: 'workbench.action.terminal.sendSequence',
    when: 'terminalFocus && isMac',
    args: { text: code },
  });
}

const json: PackageJson = {
  contributes: { keybindings },
};

process.stdout.write(JSON.stringify(json, undefined, 2));
