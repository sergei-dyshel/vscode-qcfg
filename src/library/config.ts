/**
 * Must be self-contained, e.g. do not import other modules
 * @module
 */

export namespace Config {
  /**
   * Collection of all configuration sections and corresponding value types.
   *
   * Used for auto-generation of `configuration` section of `package.json`.
   */
  export interface All {
    /**
     * Number of steps by which to auto-resize active editor
     * @default 1
     */
    'qcfg.autoResize.steps': number;

    /**
     * Whether auto-resize enabled
     * @default false
     */
    'qcfg.autoResize.enabled': boolean;

    /**
     * Mapping for alternate (header/source) switch.
     *
     * For each extension specify list of alternative extension.
     * @default {}
     */
    'qcfg.alternate.mapping': Record<string, string[]>;

    /**
     * AutoSync enabled on start
     * @default false
     */
    'qcfg.autoSync.enabled': boolean;

    /** AutoSync command */
    'qcfg.autoSync.command': string;

    /** Open preview automatically when opening markdown documents */
    'qcfg.autoMarkdownPreview': boolean;

    /** Workspace folder name for creating new notes */
    'qcfg.newNote.folder': string;

    /** Path of notes directory relative to workspace folder root */
    'qcfg.newNote.path': string;

    /**
     * List of rules to open current line in Git Web UI
     * @default []
     */
    'qcfg.git.web': Git.Entry[];

    /**
     * Per-workspace/folder setting to set it as default remote server
     * @default false
     */
    'qcfg.remote.setDefault': boolean;

    /**
     * Use gtags as workspace symbols provider
     * @default false
     */
    'qcfg.gtags.workspaceSymbols': boolean;

    /**
     * Default timeout (in milliseconds) for notifications
     * @default 3000
     */
    'qcfg.notification.timeoutMs': number;

    /**
     * Global configuration directory for vscode-qcfg specific features (defaults to HOME directory)
     * @default "~"
     */
    'qcfg.configDir.global': string;

    /**
     * Workspace configuration direcotry for vsdode-qcfg specific features, relative to workspace file's directory or the only folder by default
     * @default "."
     */
    'qcfg.configDir.workspace': string;
  }

  export namespace Git {
    export interface Link {
      /** Description of Web link */
      title: string;
      /** Web url */
      url: string;
    }

    export interface Entry {
      /** List of remote patterns */
      remotes: string[];
      /** Description of Web link */
      links: Link[];
    }
  }
}