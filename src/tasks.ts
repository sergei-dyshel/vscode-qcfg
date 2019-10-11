'use strict';

import { commands, ExtensionContext, Location, QuickPickItem, ShellExecution, Task, TaskDefinition, TaskGroup, TaskPanelKind, TaskRevealKind, tasks, TaskScope, window, workspace, WorkspaceFolder } from 'vscode';
import { filterAsync, mapAsyncNoThrow, mapSomeAsync, MAP_UNDEFINED, mapAsyncSequential } from './async';
import * as dialog from './dialog';
import { registerCommandWrapped } from './exception';
import * as language from './language';
import { log, LogLevel } from './logging';
import { Modules } from './module';
import * as nodejs from './nodejs';
import { parseLocations } from './parseLocations';
import * as remoteControl from './remoteControl';
import { Subprocess } from './subprocess';
import { TaskCancelledError, TaskRun, TaskConfilictPolicy } from './taskRunner';
import { concatArrays, mapObject } from './tsUtils';
import { currentWorkspaceFolder, getCursorWordContext } from './utils';
import { GTAGS_PARSE_REGEX } from './gtags';
import { peekLocation, globAsync } from './fileUtils';

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
}

/** Validation condition */
interface When {
  fileExists?: string;
  fileMatches?: string;
}

interface Params {
  command: string;

  cwd?: string;
  reveal?: Reveal;
  onSuccess?: EndAction;
  onFailure?: EndAction;
  exitCodes?: number[];
  locationRegex?: string;
  reindex?: boolean;
  problemMatchers?: string | string[];
  flags?: Flag[];

  /** Validation condition */
  when?: When;
}


/** Set of task parameters as retrieved from configuration */
interface ConfParamsSet {
  [label: string]: Params | string;
}

interface NamedParams {
  label: string;
  params: Params;
  fromWorkspace: boolean;
}

interface NamedParamsSet {
  [label: string]: NamedParams;
}

export async function runOneTime(name: string, params: Params) {
  const run = new QcfgTask(
      name, params, false /* not from workspace */, new QcfgTaskContext());
  await run.run();
}

/**
 * Context of running task, considering specific workspace folder,
 * current file, line, selected text etc.
 */
class QcfgTaskContext {
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
class ParamsError extends Error {
  constructor(message: string) { super(message); }
}

/**
 * Task is invalid for given context and won't be presented in list
 */
class ValidationError extends Error {
  constructor(message: string) { super(message); }
}

/**
 * Could not substitue some variables.
 */
class SubstituteError extends ValidationError {
  constructor(message: string) {
    super('Some variables could not be substituted: ' + message);
  }
}

class ConditionError extends ValidationError {
  constructor(message: string) {
    super('Condition check failed: ' + message);
  }
}

class MultiTaskError extends ValidationError {
  constructor(message: string) {
    super('Error resolving task in multiple folders: ' + message);
  }
}

async function checkCondition(
    params: Params, context: QcfgTaskContext): Promise<void> {
  const when = params.when || {};
  if (Object.keys(when).length > 1)
    throw new ParamsError(
        'Only one property can be defined for \'when\' clause');
  if (when.fileExists) {
    if (!context.workspaceFolder)
      throw new ConditionError(
          '"fileExists" can only be checked in context of workspace folder');
    const matches = await globAsync(
        when.fileExists, {cwd: context.workspaceFolder.uri.path});
    if (matches.isEmpty)
      throw new ConditionError(
          `Globbing for ${when.fileExists} returned no matches`);
  }
  else if (when.fileMatches) {
    throw new ParamsError('TODO: when.fileMatches not implemented yet');
  }
}

function instantiateTask(
    label: string, params: Params, context: QcfgTaskContext): Task {
  const def: TaskDefinition = {type: 'qcfg', task: params};
  const flags: Flag[] = params.flags || [];

  const scope = context.workspaceFolder || TaskScope.Global;
  const environ = {QCFG_VSCODE_PORT: String(remoteControl.port)};
  const shellExec = new ShellExecution(
      context.substitute(params.command),
      {cwd: params.cwd, env: environ});
  const task = new Task(
      def, scope, label, 'qcfg', shellExec, params.problemMatchers || []);
  task.presentationOptions = {
    focus: params.reveal === Reveal.Focus,
    reveal:
        ((params.reveal !== Reveal.No) ? TaskRevealKind.Always :
                                         TaskRevealKind.Never),
    panel: (flags.includes(Flag.dedicatedPanel)) ?
        TaskPanelKind.Dedicated :
        TaskPanelKind.Shared,
    clear: (flags.includes(Flag.clear) || flags.includes(Flag.build))
  };
  if (flags.includes(Flag.build))
    task.group = TaskGroup.Build;
  return task;
}

function handleValidationError(
    label: string, context: QcfgTaskContext|undefined, err: any) {
  const contextStr = context ?
      (context.workspaceFolder ? 'folder ' + context.workspaceFolder.name :
                                 'current context') :
      'multiple folders';
  if (err instanceof ValidationError)
    log.debug(
        `Error validating task "${label}" for ${contextStr}: ${err.message}`);
  else
    throw err;
}

function getTaskParamsFromConf(
    section: string, fromWorkspace: boolean): NamedParamsSet {
  const conf = workspace.getConfiguration('qcfg');
  const confParamsSet = conf.get(section, {}) as ConfParamsSet;
  return mapObject(
      confParamsSet,
      (label, paramsOrCmd) =>
          ({params: expandParamsOrCmd(paramsOrCmd), label, fromWorkspace}));
}

function getQcfgTaskParams(): NamedParams[] {
  return Object.values({
    ...(getTaskParamsFromConf('tasks.global', false)),
    ...(getTaskParamsFromConf('tasks.workspace', true))
  });
}

async function createQcfgTask(
    label: string, params: Params, context: QcfgTaskContext,
    fromWorkspace: boolean): Promise<QcfgTask> {
  await checkCondition(params, context);
  return new QcfgTask(label, params, fromWorkspace, context);
}

async function createQcfgTaskForFolders(
    namedParams: NamedParams,
    folderContexts: QcfgTaskContext[]): Promise<QcfgTask[]> {
  const {label, params, fromWorkspace} = namedParams;
  return mapSomeAsync(folderContexts, async context => {
    try {
      return await createQcfgTask(label, params, context, fromWorkspace);
    } catch (err) {
      handleValidationError(
          label, context, err);
      return MAP_UNDEFINED;
    }
  });
}

async function createQcfgMultiTask(
    namedParams: NamedParams, folderContexts: QcfgTaskContext[],
    allowSingle = false): Promise<QcfgMultiTask> {
  const folderTasks = await createQcfgTaskForFolders(namedParams, folderContexts);
  if (folderTasks.isEmpty)
    throw new MultiTaskError('Folder task not valid for any workspace folder');
  if (!allowSingle && folderTasks.length === 1) {
    throw new MultiTaskError('Task valid for only one workspace folder');
  }
  return new QcfgMultiTask(
      namedParams.label, namedParams.params, namedParams.fromWorkspace,
      folderTasks);
}

async function createQcfgMultiTaskNoThrow(
    namedParams: NamedParams, folderContexts: QcfgTaskContext[],
    allowSingle = false): Promise<QcfgMultiTask[]> {
  try {
    return [await createQcfgMultiTask(
        namedParams, folderContexts, allowSingle)];
  } catch (err) {
    handleValidationError(
        namedParams.label, undefined /* multiple folders */, err);
    return [];
  }
}

async function createSearchMultiTask(
    namedParams: NamedParams,
    contexts: QcfgTaskContext[]): Promise<SearchMultiTask> {
  const {label, params, fromWorkspace} = namedParams;
  const validContexts = await filterAsync(contexts, async context => {
    try {
      await checkCondition(params, context);
      return true;
    } catch (err){
      handleValidationError(label, context, err);
      return false;
    }
  });
  if (validContexts.isEmpty) {
    throw new MultiTaskError('The task is not valid for any workspace folder');
  }
  return new SearchMultiTask(label, params, fromWorkspace, validContexts);
}

async function createSearchMultiTaskNoThrow(
    namedParams: NamedParams, contexts: QcfgTaskContext[]) {
  try {
    return [await createSearchMultiTask(namedParams, contexts)];
  } catch (err) {
    handleValidationError(namedParams.label, undefined /* multiple folders */, err);
    return [];
  }
}

/**
 * Fetch all possible tasks for given params
 */
async function fetchQcfgTasksForParams(
    namedParams: NamedParams, currentContext: QcfgTaskContext,
    folderContexts: QcfgTaskContext[]): Promise<BaseQcfgTask[]> {
  const flags = (namedParams.params.flags || []);
  const isFolderTask = flags.includes(Flag.folder);

  if (flags.includes(Flag.search)) {
    return createSearchMultiTaskNoThrow(
        namedParams, isFolderTask ? folderContexts : [currentContext]);
  }
  if (isFolderTask) {
    const folderTasks =
        await createQcfgTaskForFolders(namedParams, folderContexts);
    if (folderTasks.length > 1) {
      for (const task of folderTasks) {
        const folder = task.context.workspaceFolder!;
        task.folderText = folder.name;
        if (folder === currentContext.workspaceFolder)
          task.folderText += ' (current)';
      }
      return concatArrays<BaseQcfgTask>(
          folderTasks,
          await createQcfgMultiTaskNoThrow(namedParams, folderContexts));
    } else {
      return folderTasks;
    }
  } else {
    return createQcfgTaskForFolders(namedParams, [currentContext]);
  }
}

async function fetchQcfgTasks(): Promise<BaseQcfgTask[]> {
  const allParams = getQcfgTaskParams();

  const currentContext = new QcfgTaskContext();
  const curFolder = currentWorkspaceFolder();
  const folders = workspace.workspaceFolders || [];

  // move current folder to the top of list
  if (curFolder) {
    folders.removeFirst(curFolder);
    folders.unshift(curFolder);
  }

  const folderContexts = folders.map(folder => new QcfgTaskContext(folder));

  const tasks = await mapSomeAsync<NamedParams, BaseQcfgTask[]>(
      allParams, async namedParams => {
        try {
          return await fetchQcfgTasksForParams(
              namedParams, currentContext, folderContexts);
        } catch (err) {
          if (err instanceof ParamsError) {
            log.warn(`Error in parameters for task "${namedParams.label}": ${
                err.message}`);
            return MAP_UNDEFINED;
          }
          throw err;
        }
      });

  return concatArrays(...tasks);
}

let lastBuildTask: BaseTask|undefined;

async function runDefaultBuildTask() {
  const qcfgTasks = await fetchQcfgTasks();
  for (const task of qcfgTasks)
    if (task.label === 'build')
      return task.run();
  const allTasks = await tasks.fetchTasks();
  for (const task of allTasks)
    if (task.group === TaskGroup.Build)
      return commands.executeCommand('workbench.action.tasks.build');
}

async function runLastBuildTask() {
  if (lastBuildTask) {
    await lastBuildTask.run();
    return;
  }
  await runDefaultBuildTask();
}

abstract class BaseTask implements dialog.ListSelectable {
  constructor(public folderText?: string) {}

  abstract run(): Promise<void>;
  abstract isBuild(): boolean;

  protected abstract isFromWorkspace(): boolean;
  protected abstract isBackground(): boolean;
  protected abstract fullName(): string;

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
    const item: QuickPickItem = {label: this.prefixTags() + this.fullName()};
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

class VscodeTask extends BaseTask {
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

  protected taskRun?: TaskRun;
}

function expandParamsOrCmd(paramsOrCmd: Params | string): Params
{
  return (typeof paramsOrCmd === 'string') ? {command: paramsOrCmd as string} :
                                             (paramsOrCmd as Params);
}


export abstract class BaseQcfgTask extends BaseTask {
  constructor(
      public label: string, protected params: Params,
      protected fromWorkspace = true) {
    super();
  }

  protected isFromWorkspace() {
    return this.fromWorkspace;
  }

  protected isBackground() {
    return false;
  }

  protected fullName() {
    return 'qcfg: ' + this.label;
  }

  isBuild() {
    return (this.params.flags || []).includes(Flag.build);
  }
}

class QcfgTask extends BaseQcfgTask{
  private task: Task;
  protected taskRun?: TaskRun;

  constructor(
      label: string, params: Params, fromWorkspace: boolean,
      readonly context: QcfgTaskContext) {
    super(label, params, fromWorkspace);
    this.task = instantiateTask(label, params, context);
  }

  async run() {
    this.taskRun = new TaskRun(this.task!);
    const conflictPolicy =
        (this.params.flags && (this.params.flags.includes(Flag.autoRestart))) ?
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
    if (success && params.flags && params.flags.includes(Flag.reindex))
      language.reindex();
    let action = success ? params.onSuccess : params.onFailure;
    if (action === EndAction.Auto || action === undefined) {
      if (success) {
        action = EndAction.Hide;
      } else {
        action =
            (params.reveal === Reveal.No) ? EndAction.Notify : EndAction.Show;
      }
    }
    if (!term)
      return;

    switch (action) {
      case EndAction.None:
        break;
      case EndAction.Dispose:
        if (window.activeTerminal === term) {
          term.dispose();
          commands.executeCommand('workbench.action.closePanel');
        } else {
          term.dispose();
        }
        break;
      case EndAction.Hide:
        term.hide();
        if (window.activeTerminal === term)
          commands.executeCommand('workbench.action.closePanel');
        break;
      case EndAction.Show:
        term.show();
        break;
      case EndAction.Notify:
        if (success)
          window.showInformationMessage(
              `Task "${this.task.name}" finished`);
        else
          window.showErrorMessage(`Task "${this.task.name}" failed`);
        break;
    }
  }
}

class QcfgMultiTask extends BaseQcfgTask {
  constructor(
      label: string, params: Params, fromWorkspace: boolean,
      private folderTasks: QcfgTask[]) {
    super(label, params, fromWorkspace);
    this.folderText = 'all folders';
  }

  run() {
    return mapAsyncSequential(this.folderTasks, task => task.run())
        .then<void>();
  }
}

class SearchExecution {
  private command: string;
  private cwd: string;
  private regex?: RegExp;

  constructor(params: Params, context: QcfgTaskContext) {
    this.command = context.substitute(params.command);
    if (params.cwd)
      this.cwd = context.substitute(params.cwd);
    else if (context.workspaceFolder)
      this.cwd = context.workspaceFolder.uri.path;
    else if (workspace.workspaceFolders)
      this.cwd = workspace.workspaceFolders[0].uri.fsPath;
    else
      this.cwd = process.cwd();
    if (params.locationRegex === 'gtags')
      this.regex = GTAGS_PARSE_REGEX;
    else if (params.locationRegex) {
      try {
        this.regex = new RegExp(params.locationRegex);
      } catch (err) {
        throw new ParamsError(
            'Invalid locationRegex regular expression: ' + err.message);
      }
    }
  }

  async getLocations(): Promise<Location[]> {
    /* TEMP: remove loglevel */
    const subproc =
        new Subprocess(this.command, {cwd: this.cwd, logLevel: LogLevel.Debug});
    const result = await subproc.wait();
    return parseLocations(result.stdout, this.cwd, this.regex)
        .map(parsedLoc => parsedLoc.location);
  }
}

class SearchMultiTask extends BaseQcfgTask {
  private executions: SearchExecution[];

  constructor(
      label: string, params: Params, fromWorkspace: boolean,
      contexts: QcfgTaskContext[]) {
    super(label, params, fromWorkspace);
    this.folderText = 'search';
    this.executions =
        contexts.map(context => new SearchExecution(params, context));
  }

  async getLocations() {
    const locsPerFolder =
        await mapAsyncNoThrow(this.executions, exec => exec.getLocations());
    return concatArrays(...locsPerFolder);
  }

  async run() {
    const locations = await this.getLocations();
    await peekLocation(locations);
  }
}

async function showTasks() {
  const [qcfgTasks, rawVscodeTasks] =
      await Promise.all([fetchQcfgTasks(), tasks.fetchTasks()]);
  const vscodeTasks = rawVscodeTasks.map(task => new VscodeTask(task));
  const allTasks = [...qcfgTasks, ...vscodeTasks];
  const anyTask = await dialog.selectObjectFromListMru(allTasks, 'tasks');
  if (!anyTask)
    return;
  if (anyTask.isBuild())
    lastBuildTask = anyTask;
  anyTask.run();
}

async function runQcfgTask(name: string)
{
  const tasks = await fetchQcfgTasks();
  for (const task of tasks) {
    if (name === task.label) {
      task.run();
      return;
    }
  }
  log.error(`Qcfg task "${name}" is not available`);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
      registerCommandWrapped('qcfg.tasks.build.last', runLastBuildTask),
      registerCommandWrapped('qcfg.tasks.build.default', runDefaultBuildTask),
      registerCommandWrapped('qcfg.tasks.runQcfg', runQcfgTask),
      registerCommandWrapped('qcfg.tasks.show', showTasks));
}

Modules.register(activate);