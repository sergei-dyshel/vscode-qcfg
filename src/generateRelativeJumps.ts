'use strict';

const START_LINE = 5;
const END_LINE = START_LINE * 10;

interface KeyBinding {
  key: string;
  command: string;
  when?: string;
  args?: any;
}

interface PackageJson {
  contributes?: {
    keybindings?: KeyBinding[]
  };
}

const keybindings: KeyBinding[] = [];

function createKey(num: number, mod: 'ctrl'|'alt'): string[] {
  if (num < 10)
    return [`${mod}+${num}`];
  else {
    const digit1 = Math.floor(num / 10);
    const digit2 = num % 10;
    return [`${mod}+${digit1} ${mod}+${digit2}`, `${mod}+${digit1} ${digit2}`];
  }
}

for (let i = START_LINE; i < END_LINE; ++i) {
  for (const key of createKey(i, 'ctrl'))
    keybindings.push({
      key,
      command: `qcfg.gotoLineRelative`,
      args: i
    });
  for (const key of createKey(i, 'alt'))
    keybindings.push({
      key,
      command: `qcfg.gotoLineRelative`,
      args: -i
    });
}

const json: PackageJson = {
  contributes: {keybindings}
};

process.stdout.write(JSON.stringify(json, undefined, 2));