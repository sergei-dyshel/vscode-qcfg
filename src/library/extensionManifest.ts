export namespace ExtensionJSON {
  export interface Key {
    key: string;
    mac?: string;
    linux?: string;
    win?: string;
  }

  export interface KeyBinding extends Key {
    command: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    args?: any;
    when?: string;
  }

  export interface Theme {
    id?: string;
    label?: string;
    uiTheme: string; // this is enum actually
    path: string;
  }

  export interface Language {
    id: string;
    extensions: string;
    firstLine?: string;
    configuration?: string;
  }

  // copied from `IUserFriendlyCommand` in vscode repo
  export interface Command {
    command: string;
    title: string;
    shortTitle?: string;
    enablement?: string;
    category?: string;
    icon?: string | { light: string; dark: string };
  }

  export interface Manifest {
    version?: string;
    name?: string;
    contributes?: {
      keybindings?: KeyBinding[];
      themes?: Theme[];
      languages?: Language[];
      configuration?: { title?: string; properties: Record<string, unknown> };
      commands?: Command[];
    };
  }
}
