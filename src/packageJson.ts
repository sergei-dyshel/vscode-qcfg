'use strict';

export interface Key {
  key: string;
  mac?: string;
}

export interface KeyBinding extends Key {
  command: string;
  when?: string;
  args?: any;
}

export interface PackageJson {
  contributes?: {
    keybindings?: KeyBinding[];
  };
}
