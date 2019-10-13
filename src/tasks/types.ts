'use strict';

import { ListSelectable } from "../dialog";
import { QuickPickItem, Task, TaskScope, workspace, TaskGroup, WorkspaceFolder, window, TaskPanelKind, TaskDefinition, ShellExecution, TaskRevealKind, commands, Location} from "vscode";
import { TaskRun } from "../taskRunner";
import { TerminalTaskParams, ProcessTaskParams, Flag, Reveal, EndAction, LocationFormat } from "./params";
import { currentWorkspaceFolder, getCursorWordContext } from "../utils";
import * as nodejs from '../nodejs';
import * as remoteControl from '../remoteControl';
import * as language from '../language';
import { parseLocations, ParseLocationFormat } from '../parseLocations';
import { Subprocess, ExecResult } from '../subprocess';
import { TaskCancelledError, TaskConfilictPolicy} from '../taskRunner';
import { mapAsyncSequential, mapAsync } from "../async";
import { LogLevel, log } from "../logging";
import { concatArrays } from "../tsUtils";
import { peekLocation } from "../fileUtils";

export interface FetchInfo {
  label: string;
  fromWorkspace: boolean;
}

/**
 * Context of running task, considering specific workspace folder,
 * current file, line, selected text etc.
 */
export class TaskContext {
  SUBSTITUTE_VARS = [
    'absoluteFile', 'relativeFile', 'relativeFileNoExt', 'cursorWord',
    'workspaceFolder', 'lineNumber', 'selectedText', 'allWorkspaceFolders'
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
      const wordCtx = getCursorWordContext();
      if (wordCtx) {
        this.vars.cursorWord = wordCtx.word;
      }
      if (this.workspaceFolder) {
        this.vars.workspaceFolder = this.workspaceFolder.uri.fsPath;
        this.vars.relativeFile =
            nodejs.path.relative(this.vars.workspaceFolder, document.fileName);
        this.vars.relativeFileNoExt = this.vars.relativeFile.replace(/\.[^/.]+$/, '');
      }
    }
    if (workspace.workspaceFolders)
      this.vars.allWorkspaceFolders =
          workspace.workspaceFolders.map(wf => wf.uri.fsPath).join(' ');
  }

  substitute(text: string): string {
    return text.replace(/\$\{([a-zA-Z]+)\}/g, (_, varname) => {
      if (!this.SUBSTITUTE_VARS.includes(varname))
        throw new ParamsError(`Unexpected variable "${varname}"`);
      const sub = this.vars[varname] as string | undefined;
      if (!sub)
        throw new SubstituteError(`Could not substitute var "${varname}"`);
      return sub;
    });
  }

  readonly workspaceFolder?: WorkspaceFolder;
  readonly vars: Substitute = {};
}

type Substitute = {
  [name: string]: string
};

/**
 * Task definition (params) has mistakes.
 */
export class ParamsError extends Error {
  constructor(message: string) { super(message); }
}

/**
 * Task is invalid for given context and won't be presented in list
 */
export class ValidationError extends Error {
  constructor(message: string) { super(message); }
}

/**
 * Could not substitue some variables.
 */
export class SubstituteError extends ValidationError {
  constructor(message: string) {
    super('Some variables could not be substituted: ' + message);
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
    if (this.isFromWorkspace())
      res += '$(home)';
    else
      res += '     ';
    res += '      ';
    return res;
  }

  protected suffixTags(): string[] {
    const tags: string[] = [];
    if (this.isBuild())
      tags.push('$(tools)');
    if (this.isBackground())
      tags.push('$(clock)');
    return tags;
  }

  toQuickPickItem() {
    const item: QuickPickItem = {label: this.prefixTags() + this.title()};
    if (this.folderText) {
      item.description = this.folderText;
    }
    const tags = this.suffixTags();
    if (tags)
      item.label += '      ' + tags.join('  ');
    return item;
  }

  toPersistentLabel() {
    return this.fullName();
  }
}

export class VscodeTask extends BaseTask {
  constructor(protected task: Task) {
    super();
    if (task.scope && task.scope !== TaskScope.Global &&
        task.scope !== TaskScope.Workspace && workspace.workspaceFolders &&
        workspace.workspaceFolders.length > 1) {
      this.folderText = task.scope.name;
    }
  }

  async run() {
    this.taskRun = new TaskRun(this.task!);
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

export abstract class BaseExecTask extends BaseTask {
  constructor(
      protected readonly params: TerminalTaskParams|ProcessTaskParams,
      protected readonly info: FetchInfo) {
    super();
  }

  get label() {
    return this.info.label;
  }

  protected isFromWorkspace() {
    return this.info.fromWorkspace;
  }

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
    return (this.params.flags || []).includes(Flag.BUILD);
  }
}

export class TerminalTask extends BaseExecTask {
  private task: Task;
  protected taskRun?: TaskRun;

  constructor(
      protected params: TerminalTaskParams, info: FetchInfo,
      context: TaskContext) {
    super(params, info);
    if (params.flags && params.flags.includes(Flag.FOLDER)) {
      this.folderText = context.workspaceFolder!.name;
    }
    this.params = params;
    const def: TaskDefinition = {type: 'qcfg', task: params};
    const flags: Flag[] = params.flags || [];

    const scope = context.workspaceFolder || TaskScope.Global;
    const environ = {QCFG_VSCODE_PORT: String(remoteControl.port)};
    const shellExec = new ShellExecution(
        context.substitute(params.command),
        {cwd: params.cwd, env: environ});
    this.task = new Task(
        def, scope, info.label, 'qcfg', shellExec, params.problemMatchers || []);
    this.task.presentationOptions = {
      focus: params.reveal === Reveal.FOCUS,
      reveal:
          ((params.reveal !== Reveal.NO) ? TaskRevealKind.Always :
                                           TaskRevealKind.Never),
      panel: (flags.includes(Flag.DEDICATED_PANEL)) ? TaskPanelKind.Dedicated :
                                                      TaskPanelKind.Shared,
      clear: (flags.includes(Flag.CLEAR) || flags.includes(Flag.BUILD))
    };
    if (flags.includes(Flag.BUILD))
      this.task.group = TaskGroup.Build;
  }

  async run() {
    this.taskRun = new TaskRun(this.task!);
    const conflictPolicy =
        (this.params.flags && (this.params.flags.includes(Flag.AUTO_RESTART))) ?
        TaskConfilictPolicy.CANCEL :
        undefined;
    await this.taskRun.start(conflictPolicy);
    try {
      await this.taskRun.wait();
    } catch (err) {
      if (err instanceof TaskCancelledError)
        return;
      throw err;
    }

    const params = this.params;
    const exitCodes = params.exitCodes || [0];
    const success = exitCodes.includes(this.taskRun!.exitCode!);
    const term = this.taskRun!.terminal;
    if (success && params.flags && params.flags.includes(Flag.REINDEX))
      language.reindex();
    let action = success ? params.onSuccess : params.onFailure;
    if (action === EndAction.AUTO || action === undefined) {
      if (success) {
        action = EndAction.HIDE;
      } else {
        action =
            (params.reveal === Reveal.NO) ? EndAction.NOTIFY : EndAction.SHOW;
      }
    }
    if (!term)
      return;

    switch (action) {
      case EndAction.NONE:
        break;
      case EndAction.DISPOSE:
        if (window.activeTerminal === term) {
          term.dispose();
          commands.executeCommand('workbench.action.closePanel');
        } else {
          term.dispose();
        }
        break;
      case EndAction.HIDE:
        term.hide();
        if (window.activeTerminal === term)
          commands.executeCommand('workbench.action.closePanel');
        break;
      case EndAction.SHOW:
        term.show();
        break;
      case EndAction.NOTIFY:
        if (success)
          window.showInformationMessage(
              `Task "${this.task.name}" finished`);
        else
          window.showErrorMessage(`Task "${this.task.name}" failed`);
        break;
    }
  }
}

export class TerminalMultiTask extends BaseExecTask {
  private folderTasks: TerminalTask[];
  constructor(
      params: TerminalTaskParams, info: FetchInfo,
      folderContexts: TaskContext[]) {
    super(params, info);
    this.folderTasks =
        folderContexts.map(context => new TerminalTask(params, info, context));
    this.folderText =
        folderContexts.map(context => context.workspaceFolder!.name).join(', ');
  }

  run() {
    return mapAsyncSequential(this.folderTasks, task => task.run())
        .then<void>();
  }
}

export class ProcessTask extends BaseExecTask {
  private command: string;
  private cwd: string;
  private parseFormat?: ParseLocationFormat;
  private parseTag?: string;

  constructor(
      protected params: ProcessTaskParams, info: FetchInfo,
      context: TaskContext) {
    super(params, info);
    if (params.flags && params.flags.includes(Flag.FOLDER)) {
      this.folderText = context.workspaceFolder!.name;
    }
    this.command = context.substitute(params.command);
    if (params.cwd)
      this.cwd = context.substitute(params.cwd);
    else if (context.workspaceFolder)
      this.cwd = context.workspaceFolder.uri.path;
    else if (workspace.workspaceFolders)
      this.cwd = workspace.workspaceFolders[0].uri.fsPath;
    else
      this.cwd = process.cwd();
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
    return parseLocations(output, this.cwd, this.parseFormat)
        .map(parsedLoc => parsedLoc.location);
  }

  private async runAndGetOutput(): Promise<string> {
    const subproc = new Subprocess(this.command, {
      cwd: this.cwd,
      logLevel: LogLevel.Debug,
      allowedCodes: this.params.exitCodes
    });
    try {
      const result = await subproc.wait();
      return result.stdout;
    } catch (err) {
      if (err instanceof ExecResult) {
        log.warn(`Task "${this.info.label}" failed with code ${
            err.code} signal ${err.signal}`);
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
      else
        await peekLocation(locations, this.parseTag);
    } else {
      await this.runAndGetOutput();
    }
  }
}

export class ProcessMultiTask extends BaseExecTask {
  private parseOutput = false;
  private parseTag?: string;
  private folderTasks: ProcessTask[];

  constructor(
      params: ProcessTaskParams, info: FetchInfo,
      folderContexts: TaskContext[]) {
    super(params, info);
    this.folderText = 'all folders';
    this.folderTasks =
        folderContexts.map(context => new ProcessTask(params, info, context));
    this.folderText =
        folderContexts.map(context => context.workspaceFolder!.name).join(', ');
    if (params.parseOutput) {
      this.parseOutput = true;
      // assuming no folder-specific vars are used in tag template
      if (params.parseOutput.tag)
        this.parseTag = folderContexts[0].substitute(params.parseOutput.tag);
    }
    this.parseOutput = params.parseOutput !== undefined;
  }

  async getLocations() {
    const locsPerFolder =
        await mapAsync(this.folderTasks, task => task.getLocations());
    return concatArrays(...locsPerFolder);
  }

  async run() {
    if (this.parseOutput) {
      const locations = await this.getLocations();
      if (locations.isEmpty)
        log.warn(`Task "${this.info.label}" returned no locations`);
      else
        await peekLocation(locations, this.parseTag);
    } else {
      await Promise.all(this.folderTasks.map(task => task.run()));
    }
  }
}