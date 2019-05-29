'use strict';

import * as vscode from 'vscode';
import { Task, window } from 'vscode';
import * as dialog from './dialog';
import * as fileUtils from './fileUtils';
import { getDocumentRoot } from './fileUtils';
import * as language from './language';
import * as logging from './logging';
import * as remoteControl from './remoteControl';

import { TaskCancelledError, TaskRun } from './taskRunner';
import { mapWithThrow, filterNonNull } from './tsUtils';
import { currentWorkspaceFolder } from './utils';
// import * as minimatch from 'minimatch';
import * as glob from 'glob';

const log = logging.Logger.create('tasks');

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

interface ParamsSet {
  [label: string]: Params | string;
}

export async function runOneTime(name: string, params: Params) {
  const run = new QcfgTask(name, params, new QcfgTaskContext());
  await run.run();
}

// TODO: remove export
export class QcfgTaskContext {
  constructor() {
    const editor = window.activeTextEditor;
    if (!editor)
      return;
    const document = editor.document;
    this.substitute.absoluteFile = document.fileName;
    if (editor.selection.isEmpty)
      this.substitute.lineNumber = String(editor.selection.active.line + 1);
    else
      this.substitute.selectedText = document.getText(editor.selection);
    const root = getDocumentRoot(document);
    if (!root)
      return;
    const {workspaceFolder, relativePath} = root;
    this.substitute.workspaceFolder = workspaceFolder.uri.fsPath;
    this.workspaceFolder = workspaceFolder;
    this.substitute.relativeFile = relativePath;
    this.substitute.relativeFileNoExt = relativePath.replace(/\.[^/.]+$/, '');

    const range = document.getWordRangeAtPosition(editor.selection.active);
    if (!range)
      return;
    this.substitute.cursorWord = document.getText(range);
  }
  readonly workspaceFolder?: vscode.WorkspaceFolder;
  readonly substitute: Substitute = {};
}

const SUBSTITUTE_VARS = [
  'absoluteFile', 'relativeFile', 'relativeFileNoExt', 'cursorWord',
  'workspaceFolder', 'lineNumber', 'selectedText'
];

type Substitute = {
  [name: string]: string
};

class ParamsError extends Error {
  constructor(message: string) { super(message); }
}

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
    Promise<QcfgTaskContext|undefined> {
  const when = params.when || {};
  const newContext = {...context, substitute: {...context.substitute}};
  if (Object.keys(when).length > 1)
    throw new ParamsError(
        'Only one property can be defined for \'when\' clause');
  if (when.fileExists) {
    if (!context.workspaceFolder)
      throw new ParamsError(
          '"fileExists" can only be checked in context of workspace folder');
    let globMatches = false;
    glob(
        when.fileExists, {cwd: context.workspaceFolder.uri.path},
        (error, matches) => {
          if (error)
            throw new ParamsError(
                `Could not glob for "${when.fileExists}": ${error.message}`);
          globMatches = true;
          newContext.substitute.whenFile = matches[0];
        });
    if (!globMatches)
      return;
    return newContext;
  }
  else if (when.fileMatches) {
    throw new ParamsError('TODO: when.fileMatches not implemented yet');
  }
  return newContext;
}

function instantiateTask(
    label: string, params: Params, context: QcfgTaskContext): Task {
  const wsFolders = log.assertNonNull<vscode.WorkspaceFolder[]>(
      vscode.workspace.workspaceFolders);
  const editor = window.activeTextEditor;
  let wsFolder: vscode.WorkspaceFolder;
  const def: vscode.TaskDefinition = {type: 'qcfg', task: params};
  const flags: Flag[] = params.flags || [];

  if (wsFolders.length === 1 || !editor) {
    wsFolder = wsFolders[0];
  } else {
    wsFolder =
        fileUtils.getDocumentRootThrowing(editor.document).workspaceFolder;
  }
  const environ = {QCFG_VSCODE_PORT: String(remoteControl.port)};
  const shellExec = new vscode.ShellExecution(
      substituteVars(params.command, context.substitute),
      {cwd: params.cwd, env: environ});
  const task = new Task(
      def, wsFolder, label, 'qcfg', shellExec, params.problemMatchers || []);
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

interface ValidationResult {
  label: string;
  params: Params;
  context: QcfgTaskContext;
}

async function validateParams(
    label: string, params: Params,
    context: QcfgTaskContext): Promise<ValidationResult|undefined> {
  try {
    const newContext = await checkCondition(params, context);
    if (newContext)
      return {label, params, context: newContext};
  }
  catch (error) {
    handleError(label, error);
  }
}

async function fetchQcfgTasks(): Promise<QcfgTask[]> {
  const conf = vscode.workspace.getConfiguration('qcfg');
  const globalTasks: ParamsSet = conf.get('tasks.global', {});
  const workspaceTasks: ParamsSet = conf.get('tasks.workspace', {});
  const all = {...globalTasks, ...workspaceTasks};
  const context = new QcfgTaskContext();
  const validationPromises = Object.entries(all).map(
      ([label, params]) =>
          validateParams(label, expandparamsOrCmd(params), context));
  const validResults = filterNonNull(await Promise.all(validationPromises));
  return mapWithThrow(
      validResults,
      res => new QcfgTask(
          res.label, res.params, res.context, (res.label in workspaceTasks)),
      (res, error) => handleError(res.label, error));
}

let lastBuildTask: VscodeTask|undefined;

async function runDefaultBuildTask() {
  const tasks = await vscode.tasks.fetchTasks();
  for (const task of tasks)
    if (task.group === vscode.TaskGroup.Build)
      return vscode.commands.executeCommand('workbench.action.tasks.build');
  return vscode.commands.executeCommand(
      'workbench.action.tasks.runTask', 'qcfg: build');
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

  protected taskRun: TaskRun;
}


function expandparamsOrCmd(paramsOrCmd: Params | string): Params
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
    const success = exitCodes.includes(this.taskRun.exitCode!);
    const term = this.taskRun.terminal;
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

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.commands.registerCommand('qcfg.tasks.build.last', runLastBuildTask),
      vscode.commands.registerCommand('qcfg.tasks.build.default', runDefaultBuildTask),
      vscode.commands.registerCommand('qcfg.tasks.runQcfg', runQcfgTask),
      vscode.commands.registerCommand('qcfg.tasks.show', showTasks));
}