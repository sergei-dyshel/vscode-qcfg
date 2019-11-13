'use strict';

export interface Key {
  key: string;
  mac?: string;
}

export interface KeyBinding extends Key {
  command: string;
  when?: string;
  args?: unknown;
}

export interface PackageJson {
  contributes?: {
    keybindings?: KeyBinding[];
  };
}
