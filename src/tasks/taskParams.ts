'use strict';

export enum Reveal {
  Focus = 'focus',
  Yes = 'yes',
  No = 'no'
}

enum EndAction {
  None = 'none',
  Auto = 'auto',
  Hide = 'hide',
  Dispose = 'dispose',
  Show = 'show',
  Notify = 'notify',
}

export enum Flag {
  dedicatedPanel = 'dedicatedPanel',
  clear = 'clear',
  autoRestart = 'autoRestart',
  reindex = 'reindex',
  build = 'build',
  search = 'search',

  /** Task applies to any workspace folder (i.e. not current dir/file) */
  folder = 'folder',

  currentFolderOnly = 'currentFolderOnly',
}

export type BaseProcessTaskFlag = Flag.build|Flag.folder;

interface When {
  fileExists?: string;
  fileMatches?: string;
}

interface BaseTaskParams {
  type?: 'process'|'search'|'terminal';
}

interface BaseProcessTaskParams extends BaseTaskParams {
  command: string;
  cwd?: string;
  when?: When;
}

export interface TerminalTaskParams extends BaseProcessTaskParams {
  type: 'terminal'|undefined;

  /**
   * Reveal terminal when running
   * @default "focus"
   */
  reveal?: Reveal;
  onSuccess?: EndAction;
  onFailure?: EndAction;
  exitCodes?: number[];
  locationRegex?: string;
  reindex?: boolean;
  problemMatchers?: string|string[];
  flags?: Array<BaseProcessTaskFlag|Flag.clear|Flag.dedicatedPanel|
                Flag.reindex|Flag.autoRestart>;
}

export interface ProcessTaskParams extends BaseProcessTaskParams {
  type: 'process';

  flags?: BaseProcessTaskFlag[];
}

export interface SearchTaskParams extends BaseTaskParams {
  type: 'search';
}

export type Params = TerminalTaskParams|ProcessTaskParams|SearchTaskParams;


export interface ParamsMap {
  [name: string]: Params|string;
}