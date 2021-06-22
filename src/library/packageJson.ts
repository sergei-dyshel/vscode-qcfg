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

export interface Theme {
  id?: string;
  label?: string;
  uiTheme: string; // this is enum actually
  path: string;
}

// copied from `ILanguageExtensionPoint` in vscode source
export interface Language {
  id: string;
  extensions?: string[];
  filenames?: string[];
  filenamePatterns?: string[];
  firstLine?: string;
  configuration?: string;
}

export interface PackageJson {
  contributes?: {
    keybindings?: KeyBinding[];
    themes?: Theme[];
    languages?: Language[];
  };
}
