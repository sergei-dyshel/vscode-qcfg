import type { ExtensionJSON } from '../library/extensionManifest';

const START_LINE = 5;
const END_LINE = START_LINE * 10;

const keybindings: ExtensionJSON.KeyBinding[] = [];

function createKey(
  num: number,
  mod: 'ctrl' | 'alt',
  macMod: 'cmd' | 'alt',
): ExtensionJSON.Key[] {
  if (num < 10) {
    return [{ key: `${mod}+${num}`, mac: `${macMod}+${num}` }];
  }
  const digit1 = Math.floor(num / 10);
  const digit2 = num % 10;
  return [
    {
      key: `${mod}+${digit1} ${mod}+${digit2}`,
      mac: `${macMod}+${digit1} ${macMod}+${digit2}`,
    },
    {
      key: `${mod}+${digit1} ${digit2}`,
      mac: `${macMod}+${digit1} ${digit2}`,
    },
  ];
}

for (let i = START_LINE; i < END_LINE; ++i) {
  for (const key of createKey(i, 'ctrl', 'cmd'))
    keybindings.push({
      ...key,
      command: 'qcfg.gotoLineRelative',
      args: i,
    });
  for (const key of createKey(i, 'alt', 'alt'))
    keybindings.push({
      ...key,
      command: 'qcfg.gotoLineRelative',
      args: -i,
    });
}

const json: ExtensionJSON.Manifest = {
  contributes: { keybindings },
};

process.stdout.write(JSON.stringify(json, undefined, 2));
