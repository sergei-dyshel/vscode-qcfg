'use strict';

import * as vscode from 'vscode';
import { Task, window } from 'vscode';
import * as dialog from './dialog';
import { registerCommandWrapped } from './exception';
import { getDocumentRoot } from './fileUtils';
import * as language from './language';
import { log } from './logging';
import * as remoteControl from './remoteControl';
import { TaskCancelledError, TaskRun } from './taskRunner';
import { mapObject, concatArrays } from './tsUtils';
import { currentWorkspaceFolder, getCursorWordContext } from './utils';
import * as glob from 'glob';
import { Modules } from './module';
import { mapAsyncNoThrow, mapAsync } from './async';

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
  parseLocations = 'parseLocations', /* TODO: remove if not needed */

  /** Task applies to any workspace folder (i.e. not current dir/file) */
  anyWorkspaceFolder = 'anyWorkspaceFolder',
}

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
  reindex?: boolean;
  problemMatchers?: string | string[];
  flags?: Flag[];

  when?: When;
}


/** Set of task parameters as retrieved from configuration */
interface ConfParamsSet {
  [label: string]: Params | string;
}

interface ParamsWithSource {
  params: Params;
  fromWorkspace: boolean;
}

interface ParamsSet {
  [label: string]: ParamsWithSource;
}

export async function runOneTime(name: string, params: Params) {
  const run = new QcfgTask(name, params, new QcfgTaskContext());
  await run.run();
}

/**
 * Context of running task, considering specific workspace folder,
 * current file, line, selected text etc.
 */
class QcfgTaskContext {

  /** Specify workspace folder for anyWorkspaceFolder task */
  constructor(folder?: vscode.WorkspaceFolder) {
    const editor = window.activeTextEditor;
    if (editor) {
      const document = editor.document;
      this.substitute.absoluteFile = document.fileName;
      if (!editor.selection.isEmpty)
        this.substitute.selectedText = document.getText(editor.selection);
      if (editor.selection.isEmpty)
        this.substitute.lineNumber = String(editor.selection.active.line + 1);
      const word = getCursorWordContext();
      if (word) {
        this.substitute.cursorWord = word.word;
      }
    }
    this.allowedVars = [
      'cursorWord', 'workspaceFolder', 'selectedText', 'allWorkspaceFolders'
    ];
    if (vscode.workspace.workspaceFolders)
      this.substitute.allWorkspaceFolders =
          vscode.workspace.workspaceFolders.map(wf => wf.uri.fsPath).join(' ');
    if (folder) {
      this.workspaceFolder = folder;
    }
    else {
      // not anyWorkspaceFolder task
      this.allowedVars.push(
          'absoluteFile', 'relativeFile', 'relativeFileNoExt', 'lineNumber');
      if (editor) {
        const document = editor.document;
        const root = getDocumentRoot(document);
        if (root) {
          const {workspaceFolder, relativePath} = root;
          this.workspaceFolder = workspaceFolder;
          this.substitute.relativeFile = relativePath;
          this.substitute.relativeFileNoExt =
              relativePath.replace(/\.[^/.]+$/, '');
        }
      }
    }
    if (this.workspaceFolder)
      this.substitute.workspaceFolder = this.workspaceFolder.uri.fsPath;
  }
  /** var not listed here will throw exception */
  readonly allowedVars: string[];
  readonly workspaceFolder?: vscode.WorkspaceFolder;
  readonly substitute: Substitute = {};
}

const SUBSTITUTE_VARS = [
  'absoluteFile', 'relativeFile', 'relativeFileNoExt', 'cursorWord',
  'workspaceFolder', 'lineNumber', 'selectedText', 'allWorkspaceFolders'
];

type Substitute = {
  [name: string]: string
};

/** wrongly defined task */
class ParamsError extends Error {
  constructor(message: string) { super(message); }
}

/** validation error - task just won't be presented in list */
class SubstituteError extends Error {
  constructor(message: string) { super(message); }
}

function substituteVars(cmd: string, substitute: Substitute): string {
  return cmd.replace(/\$\{([a-zA-Z]+)\}/g, (_, varname) => {
    if (!SUBSTITUTE_VARS.includes(varname))
      throw new ParamsError(`Unexpected variable "${varname}"`);
    const sub = substitute[varname] as string|undefined;
    if (!sub)
      throw new SubstituteError(`Could not substitute var "${varname}"`);
    return sub;
  });
}

async function checkCondition(params: Params, context: QcfgTaskContext):
    Promise<QcfgTaskContext> {
  const when = params.when || {};
  const newContext = {...context, substitute: {...context.substitute}};
  if (Object.keys(when).length > 1)
    throw new ParamsError(
        'Only one property can be defined for \'when\' clause');
  if (when.fileExists) {
    if (!context.workspaceFolder)
      throw new SubstituteError(
          '"fileExists" can only be checked in context of workspace folder');
    const matches =
        glob.sync(when.fileExists, {cwd: context.workspaceFolder.uri.path});
    if (matches.isEmpty)
      throw new SubstituteError(
          `Globbing for ${when.fileExists} returned no matches`);
    newContext.substitute.whenFile = matches[0];
    return newContext;
  }
  else if (when.fileMatches) {
    throw new ParamsError('TODO: when.fileMatches not implemented yet');
  }
  return newContext;
}

function instantiateTask(
    label: string, params: Params, context: QcfgTaskContext): Task {
  const def: vscode.TaskDefinition = {type: 'qcfg', task: params};
  const flags: Flag[] = params.flags || [];

  const scope = context.workspaceFolder || vscode.TaskScope.Global;
  const environ = {QCFG_VSCODE_PORT: String(remoteControl.port)};
  const shellExec = new vscode.ShellExecution(
      substituteVars(params.command, context.substitute),
      {cwd: params.cwd, env: environ});
  const task = new Task(
      def, scope, label, 'qcfg', shellExec, params.problemMatchers || []);
  task.presentationOptions = {
    focus: params.reveal === Reveal.Focus,
    reveal:
        ((params.reveal !== Reveal.No) ? vscode.TaskRevealKind.Always :
                                         vscode.TaskRevealKind.Never),
    panel: (flags.includes(Flag.dedicatedPanel)) ?
        vscode.TaskPanelKind.Dedicated :
        vscode.TaskPanelKind.Shared,
    clear: (flags.includes(Flag.clear) || flags.includes(Flag.build))
  };
  if (flags.includes(Flag.build))
    task.group = vscode.TaskGroup.Build;
  return task;
}

function handleError(label: string, err: any) {
  if (err instanceof SubstituteError)
    log.debug(`Error substituting variables in task "${label}": ${err.message}`);
  else if (err instanceof ParamsError)
    log.warn(`Error in parameters for task "${label}": ${err.message}`);
  else
    throw err;
}

function getTaskParamsFromConf(
    section: string, fromWorkspace: boolean): ParamsSet {
  const conf = vscode.workspace.getConfiguration('qcfg');
  return mapObject(
      conf.get(section, {}) as ConfParamsSet,
      paramsOrCmd => ({params: expandParamsOrCmd(paramsOrCmd), fromWorkspace}));
}

function getQcfgTaskParams(): ParamsSet {
  return {
    ...(getTaskParamsFromConf('tasks.global', false)),
    ...(getTaskParamsFromConf('tasks.workspace', true))
  };
}

async function createQcfgTask(
    label: string, params: Params, context: QcfgTaskContext,
    fromWorkspace: boolean): Promise<QcfgTask> {
  const newContext = await checkCondition(params, context);
  return new QcfgTask(label, params, newContext, fromWorkspace);
}

async function fetchQcfgTasks(): Promise<QcfgTask[]> {
  const allParams = getQcfgTaskParams();

  const currentContext = new QcfgTaskContext();
  const folderContexts = (vscode.workspace.workspaceFolders ||
                          []).map(folder => new QcfgTaskContext(folder));

  const tasks = await mapAsync(Object.entries(allParams), async ([label, paramsWithSrc]) => {
    const {params, fromWorkspace} = paramsWithSrc;
    if (params.flags && params.flags.includes(Flag.anyWorkspaceFolder)) {
      return (await mapAsyncNoThrow(folderContexts, async context => {
               const labelWithFolder =
                   `${label} (in ${context.workspaceFolder!.name})`;
               return await createQcfgTask(
                   labelWithFolder, params, context, fromWorkspace);
             }, (err, _) => handleError(label, err))).map(pair => pair[1]);

    } else {
      try {
        return [await createQcfgTask(
            label, params, currentContext, fromWorkspace)];
      } catch (err) {
        handleError(label, err);
        return [];
      }
    }
  });

  return concatArrays(...tasks);
}

let lastBuildTask: VscodeTask|undefined;

async function runDefaultBuildTask() {
  const qcfgTasks = await fetchQcfgTasks();
  for (const task of qcfgTasks)
    if (task.label === 'build')
      return task.run();
  const tasks = await vscode.tasks.fetchTasks();
  for (const task of tasks)
    if (task.group === vscode.TaskGroup.Build)
      return vscode.commands.executeCommand('workbench.action.tasks.build');
}

async function runLastBuildTask() {
  if (lastBuildTask) {
    await lastBuildTask.run();
    return;
  }
  await runDefaultBuildTask();
}

class VscodeTask implements dialog.ListSelectable {
  constructor(protected task: Task) {}

  async run() {
    this.taskRun = new TaskRun(this.task!);
    await this.taskRun.start();
    await this.taskRun.wait();
  }

  isBuild() {
    return this.task.group === vscode.TaskGroup.Build;
  }

  protected isFromWorkspace() {
    return this.task.source === 'Workspace';
  }

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
    if (this.task.isBackground)
      tags.push('$(clock)');
    return tags;
  }

  fullName() {
    const task = this.task;
    let fullName = task.name;
    if (task.source && task.source !== 'Workspace')
      fullName = `${task.source}: ${fullName}`;
    return fullName;
  }

  toQuickPickItem() {
    const task = this.task;
    const item: vscode.QuickPickItem = {label: this.prefixTags() + this.fullName()};
    if (task.scope && task.scope !== vscode.TaskScope.Global &&
        task.scope !== vscode.TaskScope.Workspace) {
      const folder = task.scope as vscode.WorkspaceFolder;
      if (folder !== currentWorkspaceFolder())
        item.description = folder.name;
    }
    const tags = this.suffixTags();
    if (tags)
      item.label += '      ' + tags.join('  ');
    return item;
  }

  toPersistentLabel() {
    return this.fullName();
  }

  protected taskRun?: TaskRun;
}


function expandParamsOrCmd(paramsOrCmd: Params | string): Params
{
  return (typeof paramsOrCmd === 'string') ? {command: paramsOrCmd as string} :
                                             (paramsOrCmd as Params);
}

class QcfgTask extends VscodeTask{
  constructor(
      public label: string, private params: Params, context: QcfgTaskContext,
      private fromWorkspace = true) {
    super(instantiateTask(label, params, context));
  }

  protected isFromWorkspace() {
    return this.fromWorkspace;
  }

  async run() {
    const runningTask = TaskRun.findRunningTask(this.task.name);
    if (runningTask && this.params.flags &&
        (this.params.flags.includes(Flag.autoRestart)))
      await runningTask.cancel();

    try {
      await super.run();
    }
    catch (err) {
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
          vscode.commands.executeCommand('workbench.action.closePanel');
        } else {
          term.dispose();
        }
        break;
      case EndAction.Hide:
        term.hide();
        if (window.activeTerminal === term)
          vscode.commands.executeCommand('workbench.action.closePanel');
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

async function showTasks() {
  const [qcfgTasks, rawVscodeTasks] =
      await Promise.all([fetchQcfgTasks(), vscode.tasks.fetchTasks()]);
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

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      registerCommandWrapped('qcfg.tasks.build.last', runLastBuildTask),
      registerCommandWrapped('qcfg.tasks.build.default', runDefaultBuildTask),
      registerCommandWrapped('qcfg.tasks.runQcfg', runQcfgTask),
      registerCommandWrapped('qcfg.tasks.show', showTasks));
}

Modules.register(activate);