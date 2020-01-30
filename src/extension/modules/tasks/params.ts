'use strict';

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
    | KnownProblemMatcher
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

export type Params = TerminalTaskParams | ProcessTaskParams | SearchTaskParams;

export interface ConfParamsSet {
  [name: string]: Params | string;
}
