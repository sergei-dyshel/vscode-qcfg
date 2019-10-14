'use strict';

export enum Reveal {
  FOCUS = 'focus',
  YES = 'yes',
  NO = 'no'
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
}

export enum TaskType {
  PROCESS = 'process',
  TERMINAL = 'terminal',
  SEARCH = 'search',
}

export type BaseProcessTaskFlag = Flag.BUILD|Flag.FOLDER|Flag.HIDDEN;

interface When {
  /** File exists of given glob pattern */
  fileExists?: string;

  /** Current file matches glob pattern */
  fileMatches?: string;
}

interface BaseTaskParams {
  title?: string;
  type: TaskType;
}

export interface BaseProcessTaskParams extends BaseTaskParams {
  command: string;
  cwd?: string;
  when?: When;
  /**
   * Expected process exit codes
   * @default []
   */
  exitCodes?: number[];
  flags?: Flag[];
}

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

  reindex?: boolean;

  /**
   * @default []
   */
  problemMatchers?: string|string[];

  flags?: Array<BaseProcessTaskFlag|Flag.CLEAR|Flag.DEDICATED_PANEL|
                Flag.REINDEX|Flag.AUTO_RESTART>;
}

export enum LocationFormat {
  VIMGREP = 'vimgrep',
  GTAGS = 'gtags'
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
}

export type Params = TerminalTaskParams|ProcessTaskParams;


export interface ConfParamsSet {
  [name: string]: Params|string;
}