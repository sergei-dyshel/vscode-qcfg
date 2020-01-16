'use strict';

import {
  commands,
  FindTextInFilesOptions,
  Location,
  QuickPickItem,
  ShellExecution,
  Task,
  TaskDefinition,
  TaskGroup,
  TaskPanelKind,
  TaskRevealKind,
  TaskScope,
  TextSearchQuery,
  window,
  workspace,
  WorkspaceFolder,
} from 'vscode';
import { mapAsync, mapAsyncSequential } from '../async';
import { ListSelectable } from '../dialog';
import { getDocumentWorkspaceFolder, peekLocations } from '../fileUtils';
import { log, LogLevel } from '../logging';
import * as nodejs from '../nodejs';
import { ParseLocationFormat, parseLocations } from '../parseLocations';
import * as remoteControl from '../remoteControl';
import { searchInFiles } from '../search';
import { ExecResult, Subprocess } from '../subprocess';
import {
  TaskCancelledError,
  TaskConfilictPolicy,
  TaskRun,
} from '../taskRunner';
import { concatArrays } from '../tsUtils';
import { currentWorkspaceFolder, getCursorWordContext } from '../utils';
import {
  BaseTaskParams,
  EndAction,
  Flag,
  LocationFormat,
  ProcessTaskParams,
  Reveal,
  SearchTaskParams,
  TaskType,
  TerminalTaskParams,
} from './params';
import { handleAsyncStd } from '../exception';
import { saveAndPeekSearch } from '../savedSearch';
import { refreshLangClients } from '../langClient';

export interface FetchInfo {
  label: string;
  fromWorkspace: boolean;
}

export function isFolderTask(params: BaseTaskParams) {
  return (
    (params.flags && params.flags.includes(Flag.FOLDER)) ||
    params.type === TaskType.SEARCH ||
    params.folders
  );
}

/**
 * Context of running task, considering specific workspace folder,
 * current file, line, selected text etc.
 */
export class TaskContext {
  SUBSTITUTE_VARS = [
    'absoluteFile',
    'relativeFile',
    'relativeFileNoExt',
    'cursorWord',
    'workspaceFolder',
    'lineNumber',
    'selectedText',
    'allWorkspaceFolders',
  ];

  constructor(folder?: WorkspaceFolder) {
    const editor = window.activeTextEditor;
    this.workspaceFolder = folder || currentWorkspaceFolder();
    if (editor) {
      const document = editor.document;
      this.vars.absoluteFile = document.fileName;
      if (!editor.selection.isEmpty)
        this.vars.selectedText = document.getText(editor.selection);
      if (editor.selection.isEmpty)
        this.vars.lineNumber = String(editor.selection.active.line + 1);
      if (!editor.selection.isEmpty) {
        this.vars.cursorWord = document.getText(editor.selection);
      } else {
        const wordCtx = getCursorWordContext();
        if (wordCtx) {
          this.vars.cursorWord = wordCtx.word;
        }
      }
      if (this.workspaceFolder) {
        this.vars.workspaceFolder = this.workspaceFolder.uri.fsPath;
        this.vars.relativeFile = nodejs.path.relative(
          this.vars.workspaceFolder,
          document.fileName,
        );
        this.vars.relativeFileNoExt = this.vars.relativeFile.replace(
          /\.[^/.]+$/,
          '',
        );
      }
    }
    if (workspace.workspaceFolders)
      this.vars.allWorkspaceFolders = workspace.workspaceFolders
        .map(wf => wf.uri.fsPath)
        .join(' ');
  }

  substitute(text: string): string {
    return text.replace(/\$\{([a-zA-Z]+)\}/g, (_, varname) => {
      if (!this.SUBSTITUTE_VARS.includes(varname))
        throw new ParamsError(`Unexpected variable "${varname}"`);
      const sub = this.vars[varname] as string | undefined;
      if (!sub) throw new TaskVarSubstituteError(varname);
      return sub;
    });
  }

  readonly workspaceFolder?: WorkspaceFolder;
  readonly vars: Substitute = {};
}

type Substitute = {
  [name: string]: string;
};

/**
 * Task definition (params) has mistakes.
 */
export class ParamsError extends Error {}

/**
 * Task is invalid for given context and won't be presented in list
 */
export class ValidationError extends Error {}

/**
 * Could not substitue variable
 */
export class TaskVarSubstituteError extends ValidationError {
  constructor(public varname: string) {
    super(`Could not substitute variable "${varname}"`);
  }
}

export class ConditionError extends ValidationError {
  constructor(message: string) {
    super('Condition check failed: ' + message);
  }
}

export abstract class BaseTask implements ListSelectable {
  constructor(public folderText?: string) {}

  abstract run(): Promise<void>;
  abstract isBuild(): boolean;

  protected abstract isFromWorkspace(): boolean;
  protected abstract isBackground(): boolean;
  protected abstract fullName(): string;
  /** For quick pick list */
  protected abstract title(): string;

  protected prefixTags(): string {
    let res = '';
    if (this.isFromWorkspace()) res += '$(home)';
    else res += '     ';
    res += '      ';
    return res;
  }

  protected suffixTags(): string[] {
    const tags: string[] = [];
    if (this.isBuild()) tags.push('$(tools)');
    if (this.isBackground()) tags.push('$(clock)');
    return tags;
  }

  toQuickPickItem() {
    const item: QuickPickItem = { label: this.prefixTags() + this.title() };
    if (this.folderText) {
      item.description = this.folderText;
    }
    const tags = this.suffixTags();
    if (tags) item.label += '      ' + tags.join('  ');
    return item;
  }

  toPersistentLabel() {
    return this.fullName();
  }
}

export class VscodeTask extends BaseTask {
  constructor(protected task: Task) {
    super();
    if (
      task.scope &&
      task.scope !== TaskScope.Global &&
      task.scope !== TaskScope.Workspace &&
      workspace.workspaceFolders &&
      workspace.workspaceFolders.length > 1
    ) {
      this.folderText = task.scope.name;
    }
  }

  async run() {
    this.taskRun = new TaskRun(this.task);
    await this.taskRun.start();
    await this.taskRun.wait();
  }

  isBuild() {
    return this.task.group === TaskGroup.Build;
  }

  protected isFromWorkspace() {
    return this.task.source === 'Workspace';
  }

  protected isBackground() {
    return this.task.isBackground;
  }

  fullName() {
    const task = this.task;
    let fullName = task.name;
    if (task.source && task.source !== 'Workspace')
      fullName = `${task.source}: ${fullName}`;
    return fullName;
  }

  title() {
    return this.fullName();
  }

  protected taskRun?: TaskRun;
}

export abstract class BaseQcfgTask extends BaseTask {
  constructor(
    protected readonly params:
      | TerminalTaskParams
      | ProcessTaskParams
      | SearchTaskParams,
    protected readonly info: FetchInfo,
  ) {
    super();
  }

  get label() {
    return this.info.label;
  }

  protected isFromWorkspace() {
    return this.info.fromWorkspace;
  }

  // eslint-disable-next-line class-methods-use-this
  protected isBackground() {
    return false;
  }

  protected fullName() {
    return 'qcfg: ' + this.info.label;
  }

  protected title() {
    return 'qcfg: ' + (this.params.title || this.info.label);
  }

  isBuild() {
    if (this.params.type === TaskType.SEARCH) return false;
    return (this.params.flags || []).includes(Flag.BUILD);
  }
}

export class TerminalTask extends BaseQcfgTask {
  private task: Task;
  protected taskRun?: TaskRun;

  constructor(
    protected params: TerminalTaskParams,
    info: FetchInfo,
    context: TaskContext,
  ) {
    super(params, info);
    if (isFolderTask(params)) {
      this.folderText = context.workspaceFolder!.name;
    }
    this.params = params;
    const def: TaskDefinition = { type: 'qcfg', task: params };
    const flags: Flag[] = params.flags || [];

    const scope = context.workspaceFolder || TaskScope.Global;
    const environ = { QCFG_VSCODE_PORT: String(remoteControl.port) };
    const shellExec = new ShellExecution(context.substitute(params.command), {
      cwd: params.cwd,
      env: environ,
    });
    this.task = new Task(
      def,
      scope,
      info.label,
      'qcfg',
      shellExec,
      params.problemMatchers || [],
    );
    this.task.presentationOptions = {
      focus: params.reveal === Reveal.FOCUS,
      reveal:
        params.reveal !== Reveal.NO
          ? TaskRevealKind.Always
          : TaskRevealKind.Never,
      panel: flags.includes(Flag.DEDICATED_PANEL)
        ? TaskPanelKind.Dedicated
        : TaskPanelKind.Shared,
      clear: flags.includes(Flag.CLEAR) || flags.includes(Flag.BUILD),
    };
    if (flags.includes(Flag.BUILD)) this.task.group = TaskGroup.Build;
  }

  async run() {
    this.taskRun = new TaskRun(this.task);
    const conflictPolicy =
      this.params.flags && this.params.flags.includes(Flag.AUTO_RESTART)
        ? TaskConfilictPolicy.CANCEL_PREVIOUS
        : undefined;
    await this.taskRun.start(conflictPolicy);
    try {
      await this.taskRun.wait();
    } catch (err) {
      if (err instanceof TaskCancelledError) return;
      throw err;
    }

    const params = this.params;
    const exitCodes = params.exitCodes || [0];
    const success = exitCodes.includes(this.taskRun.exitCode!);
    const term = this.taskRun.terminal;
    if (success && params.flags && params.flags.includes(Flag.REINDEX))
      handleAsyncStd(refreshLangClients());
    let action = success ? params.onSuccess : params.onFailure;
    if (action === EndAction.AUTO || action === undefined) {
      if (success) {
        action = EndAction.HIDE;
      } else {
        action =
          params.reveal === Reveal.NO ? EndAction.NOTIFY : EndAction.SHOW;
      }
    }
    if (!term) return;

    switch (action) {
      case EndAction.NONE:
        break;
      case EndAction.DISPOSE:
        if (window.activeTerminal === term) {
          term.dispose();
          await commands.executeCommand('workbench.action.closePanel');
        } else {
          term.dispose();
        }
        break;
      case EndAction.HIDE:
        term.hide();
        if (window.activeTerminal === term)
          await commands.executeCommand('workbench.action.closePanel');
        break;
      case EndAction.SHOW:
        term.show();
        break;
      case EndAction.NOTIFY:
        if (success)
          await window.showInformationMessage(
            `Task "${this.task.name}" finished`,
          );
        else await window.showErrorMessage(`Task "${this.task.name}" failed`);
        break;
    }
  }
}

export class TerminalMultiTask extends BaseQcfgTask {
  private folderTasks: TerminalTask[];
  constructor(
    params: TerminalTaskParams,
    info: FetchInfo,
    folderContexts: TaskContext[],
  ) {
    super(params, info);
    this.folderTasks = folderContexts.map(
      context => new TerminalTask(params, info, context),
    );
    this.folderText = folderContexts
      .map(context => context.workspaceFolder!.name)
      .join(', ');
  }

  run() {
    return mapAsyncSequential(this.folderTasks, task => task.run()).then<
      void
    >();
  }
}

export class ProcessTask extends BaseQcfgTask {
  private command: string;
  private cwd: string;
  private parseFormat?: ParseLocationFormat;
  private parseTag?: string;

  constructor(
    protected params: ProcessTaskParams,
    info: FetchInfo,
    context: TaskContext,
  ) {
    super(params, info);
    if (params.flags && params.flags.includes(Flag.FOLDER)) {
      this.folderText = context.workspaceFolder!.name;
    }
    this.command = context.substitute(params.command);
    if (params.cwd) this.cwd = context.substitute(params.cwd);
    else if (context.workspaceFolder)
      this.cwd = context.workspaceFolder.uri.path;
    else if (workspace.workspaceFolders)
      this.cwd = workspace.workspaceFolders[0].uri.fsPath;
    else this.cwd = process.cwd();
    if (params.parseOutput) {
      switch (params.parseOutput.format) {
        case LocationFormat.VIMGREP:
          this.parseFormat = ParseLocationFormat.VIMGREP;
          break;
        case LocationFormat.GTAGS:
          this.parseFormat = ParseLocationFormat.GTAGS;
          break;
      }
      if (params.parseOutput.tag)
        this.parseTag = context.substitute(params.parseOutput.tag);
    }
  }

  async getLocations(): Promise<Location[]> {
    if (this.parseFormat === undefined)
      throw Error('Output parsing not defined for this task');
    const output = await this.runAndGetOutput();
    return parseLocations(output, this.cwd, this.parseFormat);
  }

  private async runAndGetOutput(): Promise<string> {
    const subproc = new Subprocess(this.command, {
      cwd: this.cwd,
      logLevel: LogLevel.Debug,
      statusBarMessage: this.info.label,
      allowedCodes: this.params.exitCodes,
    });
    try {
      const result = await subproc.wait();
      return result.stdout;
    } catch (err) {
      if (err instanceof ExecResult) {
        log.warn(
          `Task "${this.info.label}" failed with code ${err.code} signal ${err.signal}`,
        );
        return '';
      }
      throw err;
    }
  }

  async run() {
    if (this.parseFormat) {
      const locations = await this.getLocations();
      if (locations.isEmpty)
        log.warn(`Task "${this.info.label}" returned no locations`);
      else await peekLocations(locations, this.parseTag);
    } else {
      await this.runAndGetOutput();
    }
  }
}

export class ProcessMultiTask extends BaseQcfgTask {
  private parseOutput = false;
  private parseTag?: string;
  private folderTasks: ProcessTask[];

  constructor(
    params: ProcessTaskParams,
    info: FetchInfo,
    folderContexts: TaskContext[],
  ) {
    super(params, info);
    this.folderTasks = folderContexts.map(
      context => new ProcessTask(params, info, context),
    );
    this.folderText = folderContexts
      .map(context => context.workspaceFolder!.name)
      .join(', ');
    if (params.parseOutput) {
      this.parseOutput = true;
      // assuming no folder-specific vars are used in tag template
      if (params.parseOutput.tag)
        this.parseTag = folderContexts[0].substitute(params.parseOutput.tag);
    }
    this.parseOutput = params.parseOutput !== undefined;
  }

  async getLocations() {
    const locsPerFolder = await mapAsync(this.folderTasks, task =>
      task.getLocations(),
    );
    return concatArrays(...locsPerFolder);
  }

  async run() {
    if (this.parseOutput) {
      const locations = await this.getLocations();
      if (locations.isEmpty)
        log.warn(`Task "${this.info.label}" returned no locations`);
      else await peekLocations(locations, this.parseTag);
    } else {
      await Promise.all(this.folderTasks.map(task => task.run()));
    }
  }
}

export class SearchMultiTask extends BaseQcfgTask {
  private query: TextSearchQuery;
  private options: FindTextInFilesOptions;
  private folders: WorkspaceFolder[];
  private searchTitle: string;

  constructor(
    params: SearchTaskParams,
    info: FetchInfo,
    folderContexts: TaskContext[],
  ) {
    super(params, info);
    this.folderText = folderContexts
      .map(context => context.workspaceFolder!.name)
      .join(', ');

    this.folders = folderContexts.map(context => {
      if (!context.workspaceFolder)
        throw new Error('Search task can only be defined for workspace folder');
      return context.workspaceFolder;
    });
    const flags = params.flags || [];
    this.query = {
      pattern: folderContexts[0].substitute(params.query),
      isRegExp: flags.includes(Flag.REGEX),
      isCaseSensitive: flags.includes(Flag.CASE),
      isWordMatch: flags.includes(Flag.WORD),
    };
    this.searchTitle = params.searchTitle
      ? folderContexts[0].substitute(params.searchTitle)
      : `Query "${this.query.pattern}"`;
    this.options = {
      // XXX: there is a bug that happens when RelativePattern is used, it
      // causes search to return partial results, so we must use filtering
      // instead
      // include: new RelativePattern(context.workspaceFolder.uri.fsPath,
      // '**')
    };
  }

  async getLocations() {
    const locations = await searchInFiles(this.query, this.options);
    return locations.filter(location => {
      const folder = getDocumentWorkspaceFolder(location.uri.fsPath);
      if (!folder) return false;
      return this.folders.includes(folder);
    });
  }

  async run() {
    return saveAndPeekSearch(this.searchTitle, () => this.getLocations());
  }
}

export class SearchTask extends SearchMultiTask {
  constructor(params: SearchTaskParams, info: FetchInfo, context: TaskContext) {
    super(params, info, [context]);
  }
}
