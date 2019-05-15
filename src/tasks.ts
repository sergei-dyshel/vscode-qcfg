'use strict';

import * as vscode from 'vscode';
import {window, Task} from 'vscode';

import * as language from './language';
import * as fileUtils from './fileUtils';
import * as logging from './logging';
import * as dialog from './dialog';
import * as remoteControl from './remoteControl';
import {getActiveTextEditor, currentWorkspaceFolder} from './utils';
import {mapObject, mapWithThrow} from './tsUtils';
import {TaskRun, TaskCancelledError} from './taskRunner';

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
}

interface ParamsSet {
  [label: string]: Params | string;
}

export async function runOneTime(name: string, params: Params) {
  const run = new QcfgTask(name, params);
  await run.run();
}

const SUBSTITUTE: {[name: string]: () => string | undefined} = {
  'cursorWord': () => {
    const editor = getActiveTextEditor();
    const document = editor.document;
    const range = document.getWordRangeAtPosition(editor.selection.active);
    if (!range)
      return undefined;
    return document.getText(range);
  }
};

type SubstituteMap = {
  [name: string]: string | undefined
};

class InstantiationError extends Error {
  constructor(message: string) { super(message); }
}

function substituteVars(cmd: string, substitute?: SubstituteMap): string {
  let prevCmd = cmd;
  let numSubs = 0;
  if (!substitute)
    substitute = calcSubstitute();
  do {
    prevCmd = cmd;
    for (const varname of Object.keys(substitute)) {
      const place = '${' + varname + '}';
      const subs = substitute[varname];
      if (!cmd.includes(place))
        continue;
      if (subs === undefined)
        throw new InstantiationError(`Could not substitute var "${varname}"`);
      cmd = cmd.replace(place, subs);
      ++numSubs;
    }
    log.assert(numSubs < 10, `Did ${numSubs} for single command: ${cmd}`);
  } while (cmd !== prevCmd);
  return cmd;
}

function createTask(
    label: string, params: Params, substitute?: SubstituteMap): Task {
  const wsFolders = log.assertNonNull<vscode.WorkspaceFolder[]>(
      vscode.workspace.workspaceFolders);
  const editor = window.activeTextEditor;
  let wsFolder: vscode.WorkspaceFolder;
  const def: vscode.TaskDefinition = {type: 'qcfg', task: params};
  const flags: Flag[] = params.flags || [];

  if (wsFolders.length === 1 || !editor) {
    wsFolder = wsFolders[0];
  } else {
    // TODO: handle correctly
    wsFolder =
        fileUtils.getDocumentRootThrowing(editor.document).workspaceFolder;
  }
  const environ = {QCFG_VSCODE_PORT: String(remoteControl.port)};
  // const procExec = new vscode.ProcessExecution(
  //     'bash-with-sleep.sh', ['/bin/bash', '-c', substituteVars(params.command)],
  //     {cwd: params.cwd, env: environ});
  const shellExec = new vscode.ShellExecution(
      substituteVars(params.command, substitute),
      {cwd: params.cwd, env: environ});
  const task = new Task(
      def, wsFolder, label, 'qcfg', shellExec, params.problemMatchers || []);
  // const shellExec =
  //     new vscode.ShellExecution(params.command, {cwd: '${workspaceFolder}'});
  // const task = new Task(
  //     def, label, 'qcfg', shellExec, params.problemMatchers || []);
  task.presentationOptions = {
    focus: params.reveal === Reveal.Focus,
    reveal:
        ((params.reveal !== Reveal.No) ? vscode.TaskRevealKind.Always :
                                         vscode.TaskRevealKind.Never),
    panel: (flags.includes(Flag.dedicatedPanel)) ?
        vscode.TaskPanelKind.Dedicated :
        vscode.TaskPanelKind.Shared,
    clear: (flags.includes(Flag.clear))
  };
  if (flags.includes(Flag.build))
    task.group = vscode.TaskGroup.Build;
  return task;
}

function fetchQcfgTasks(): QcfgTask[] {
  const conf = vscode.workspace.getConfiguration('qcfg');
  const globalTasks: ParamsSet = conf.get('tasks.global', {});
  const workspaceTasks: ParamsSet = conf.get('tasks.workspace', {});
  const all =  {...globalTasks, ...workspaceTasks};
  const substitute = calcSubstitute();
  return mapWithThrow(
      Object.entries(all),
      ([label, params]) =>
          new QcfgTask(label, params, (label in workspaceTasks), substitute),
      ([label, _], err: Error) => {
        log.debug(`Could not instanatiate task ${label}: ${err.message}`);
      });
}

function calcSubstitute() {
  return mapObject(SUBSTITUTE, f => f());
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

  protected tags(): string[] {
    const tags: string[] = [];
    if (this.isBuild())
      tags.push('build');
    if (this.task.source === 'Workspace')
      tags.push('workspace');
    if (this.task.isBackground)
      tags.push('background');
    return tags;
  }

  toQuickPickItem() {
    const task = this.task;
    let label = task.name;
    if (task.source && task.source !== 'Workspace')
      label = `${task.source}: ${label}`;
    const scope = (task.scope && task.scope !== vscode.TaskScope.Global &&
                   task.scope !== vscode.TaskScope.Workspace) ?
        task.scope as vscode.WorkspaceFolder :
        undefined;
    if (scope && task.scope !== currentWorkspaceFolder())  // workspace folder
      label = `${label} (${scope.name})`;
      return {label, description: this.tags().join(', ')};
  }

  toPersistentLabel() {
    return this.toQuickPickItem().label;
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
      public label: string, paramsOrCmd: Params | string,
      private fromWorkspace?: boolean, substitute?: SubstituteMap) {
    super(createTask(label, expandparamsOrCmd(paramsOrCmd), substitute));
    this.params = expandparamsOrCmd(paramsOrCmd);
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

  protected tags(): string[] {
    const tags = super.tags();
    if (this.fromWorkspace)
      tags.push('workspace');
    return tags;
  }

  private params: Params;
}

async function showTasks() {
  const qcfgTasks = fetchQcfgTasks();

  const rawVscodeTasks = await vscode.tasks.fetchTasks();
  const vscodeTasks = rawVscodeTasks.map(task => new VscodeTask(task));
  const allTasks = [...qcfgTasks, ...vscodeTasks];
  const anyTask = await dialog.selectObjectFromListMru(allTasks, 'tasks');
  if (!anyTask)
    return;
  if (anyTask.isBuild())
    lastBuildTask = anyTask;
  anyTask.run();
}

function runQcfgTask(name: string)
{
  const tasks = fetchQcfgTasks();
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