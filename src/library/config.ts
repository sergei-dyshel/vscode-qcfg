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
     * Use gtags hover symbol provider
     * @default false
     */
    'qcfg.gtags.hover': boolean;

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

    /**
     * Whether do show per-file diagnostic counts in statusbar
     * @scope language-overridable
     * @default true
     */
    'qcfg.fileDiagnostics.show': boolean;

    /**
     * Exclude diagnostics whose message matches this pattern
     * @scope language-overridable
     */
    'qcfg.fileDiagnostics.excludeMessage': string;

    /**
     * Exclude diagnostics whose source matches this pattern
     * @scope language-overridable
     */
    'qcfg.fileDiagnostics.excludeSource': string;

    /**
     * Exclude diagnostics whose code matches any of these
     * @scope language-overridable
     */
    'qcfg.fileDiagnostics.excludeCodes': Array<number | string>;

    /**
     * C/C++ language clients are remote (over SSH)
     * @default false
     */
    'qcfg.langClient.remote': boolean;

    /**
     * Add clangd provider for type hierarchy
     * @default true
     */
    'qcfg.clangd.typeHierarchy': boolean;

    /**
     * Add ccls provider for type hierarchy
     * @default true
     */
    'qcfg.ccls.typeHierarchy': boolean;

    /**
     * Add ccls provider for call hierarchy
     * @default true
     */
    'qcfg.ccls.callHierarchy': boolean;

    /**
     * Array of configuration rules per file type, name etc.
     * @default []
     */
    'qcfg.configRules': ConfigRules.Rule[];

    /**
     * Dictionary of tasks
     * @default {}
     */
    'qcfg.tasks': Tasks.ConfParamsSet;
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

  export namespace ConfigRules {
    export type QuickFixCodeActionsConfig = Array<string | [string, number]>;

    export interface RuleConfig {
      /** TODO: add docs */
      quickFixCodeActions?: QuickFixCodeActionsConfig;
    }

    export interface Rule extends Condition, RuleConfig {}

    export interface Condition {
      /** Glob pattern to match against file name. */
      glob?: string;
      /** Language ID of file */
      language?: string;
    }
  }

  export namespace Tasks {
    export enum Reveal {
      FOCUS = 'focus',
      YES = 'yes',
      NO = 'no',
    }

    export enum EndAction {
      NONE = 'none',
      AUTO = 'auto',
      HIDE = 'hide',
      DISPOSE = 'dispose',
      SHOW = 'show',
      NOTIFY = 'notify',
    }

    export enum Flag {
      DEDICATED_PANEL = 'dedicatedPanel',
      CLEAR = 'clear',
      AUTO_RESTART = 'autoRestart',
      REINDEX = 'reindex',
      BUILD = 'build',
      /** Task is hidden when from pick list, i.e. can be run only directly */
      HIDDEN = 'hidden',

      /** Task applies to any workspace folder (i.e. not current dir/file) */
      FOLDER = 'folder',

      // Search specific flags
      REGEX = 'regex',
      WORD = 'word',
      CASE = 'case',
    }

    export enum TaskType {
      PROCESS = 'process',
      TERMINAL = 'terminal',
      SEARCH = 'search',
    }

    export type BaseProcessTaskFlag = Flag.BUILD | Flag.FOLDER | Flag.HIDDEN;

    interface When {
      /** File exists of given glob pattern */
      fileExists?: string;

      /** Current file matches glob pattern */
      fileMatches?: string;
    }

    export interface BaseTaskParams {
      title?: string;
      type: TaskType;
      when?: When;
      flags?: Flag[];

      /**
       * Workspace folders in which this task is valid
       * @default []
       */
      folders?: string[];
    }

    export interface BaseProcessTaskParams extends BaseTaskParams {
      command: string;
      cwd?: string;
      /**
       * Expected process exit codes
       * @default []
       */
      exitCodes?: number[];
    }

    // only to add auto-complete suggestions to schema
    type KnownProblemMatcher = 'gcc-relative' | 'gcc-absolute';

    export interface TerminalTaskParams extends BaseProcessTaskParams {
      type: TaskType.TERMINAL;

      /**
       * Reveal terminal when running
       * @default "yes"
       */
      reveal?: Reveal;

      /**
       * @default "auto"
       */
      onSuccess?: EndAction;

      /**
       * @default "auto"
       */
      onFailure?: EndAction;

      /**
       * @default []
       */
      problemMatchers?:
        | string
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
        | KnownProblemMatcher
        // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
        | Array<string | KnownProblemMatcher>;

      flags?: Array<
        | BaseProcessTaskFlag
        | Flag.CLEAR
        | Flag.DEDICATED_PANEL
        | Flag.REINDEX
        | Flag.AUTO_RESTART
      >;
    }

    export enum LocationFormat {
      VIMGREP = 'vimgrep',
      GTAGS = 'gtags',
    }

    export interface ParseOutput {
      format: LocationFormat;
      tag?: string;
    }

    export interface ProcessTaskParams extends BaseProcessTaskParams {
      type: TaskType.PROCESS;

      /** Extract locations from output using predefined format or custom regular expression */
      parseOutput?: ParseOutput;

      flags?: BaseProcessTaskFlag[];
    }

    export interface SearchTaskParams extends BaseTaskParams {
      type: TaskType.SEARCH;
      query: string;
      searchTitle?: string;
      flags?: Array<Flag.HIDDEN | Flag.REGEX | Flag.WORD | Flag.CASE>;
    }

    export type Params =
      | TerminalTaskParams
      | ProcessTaskParams
      | SearchTaskParams;

    export type ConfParamsSet = Record<string, Params | string>;
  }
}
