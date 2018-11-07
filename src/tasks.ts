'use strict';

import * as vscode from 'vscode';
import * as language from './language';
import * as fileUtils from './fileUtils';
import * as logging from './logging';
import {DefaultDictionary, Queue} from 'typescript-collections';

const log = new logging.Logger('tasks');

enum Reveal {
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

interface Params {
  command: string;
  cwd?: string;
  reveal?: Reveal;
  onSuccess?: EndAction;
  onFailure?: EndAction;
  reindex?: boolean;
  build?: boolean;
  problemMatchers?: string | string[];
  dedicatedPanel?: boolean;
}

interface ParamsSet {
  [label: string]: Params;
}

interface OneTimeContext {
  resolve?: () => void;
  reject?: (exitCode: number) => void;
  params: Params;
}

const oneTimeTasks: {[name: string]: OneTimeContext} = {};
const taskQueue =
    new DefaultDictionary<string, Queue<Params>>(() => new Queue<Params>());

async function dequeueOneTime(name: string, params: Params)
{
  const context: OneTimeContext = {'params': params};
  oneTimeTasks[name] = context;
  const tasks = await vscode.tasks.fetchTasks({'type': 'qcfg'});
  for (const task of tasks) {
    console.log('Task', task.name);
    if (task.name === name) {
      console.log('One time task', task);
      return new Promise((resolve, reject) => {
        context.resolve = resolve;
        context.reject = reject;
        return vscode.tasks.executeTask(task);
      });
    }
  }
  // taskName = '';
  // TODO: throw error
}
export async function runOneTime(name: string, params: Params) {
  if (name in oneTimeTasks) {
    log.info(`Task "${name} already running, queuing`);
    taskQueue.getValue(name).enqueue(params);
    return;
  }
  dequeueOneTime(name, params);
}

// taken from https://www.npmjs.com/package/es6-dynamic-template
function makeTemplate(templateString, templateVariables) {
	const keys = Object.keys(templateVariables);
  const values = Object.values(templateVariables);
	const templateFunction = new Function(...keys, `return \`${templateString}\`;`);
	return templateFunction(...values);
}

function createTask(label: string, params: Params): vscode.Task {
  const def: vscode.TaskDefinition = {type: 'qcfg', task: params};
  const wsFolders = vscode.workspace.workspaceFolders;
  const editor = vscode.window.activeTextEditor;
  let wsFolder: vscode.WorkspaceFolder;
  if (wsFolders.length === 1 || !editor) {
    wsFolder = wsFolders[0];
  } else {
    wsFolder = fileUtils.getDocumentRoot(editor.document).wsFolder;
  }
  const procExec = new vscode.ProcessExecution(
      'bash-with-sleep.sh',
      ['/bin/bash', '-c', params.command], {cwd: params.cwd});
  const shellExec =
      new vscode.ShellExecution(params.command, {cwd: params.cwd});
  const task = new vscode.Task(
      def, wsFolder, label, 'qcfg', procExec, params.problemMatchers || []);
  // const shellExec =
  //     new vscode.ShellExecution(params.command, {cwd: '${workspaceFolder}'});
  // const task = new vscode.Task(
  //     def, label, 'qcfg', shellExec, params.problemMatchers || []);
  task.presentationOptions = {
    focus: params.reveal === Reveal.Focus,
    reveal:
        ((params.reveal === undefined || params.reveal === Reveal.No) ?
             vscode.TaskRevealKind.Never :
             vscode.TaskRevealKind.Always),
    panel: params.dedicatedPanel ? vscode.TaskPanelKind.Dedicated :
                                   vscode.TaskPanelKind.Shared
  };
  if (params.build)
    task.group = vscode.TaskGroup.Build;
  return task;
}

function getAllTaskParams(): ParamsSet {
  const conf = vscode.workspace.getConfiguration('qcfg');
  const global: ParamsSet = conf.get('tasks.global', {});
  const ws: ParamsSet = conf.get('tasks.workspace', {});
  const all: ParamsSet = {...global, ...ws};
  for (const name of Object.keys(oneTimeTasks))
    all[name] = oneTimeTasks[name].params;
  return all;
}

function getQcfgTasks(): vscode.Task[] {
  const all = getAllTaskParams();
  const result: vscode.Task[] = [];
  for (const label of Object.keys(all)) {
    try {
      result.push(createTask(label, all[label]));
    } catch (err) {
      log.error(`Could not create qcfg task "${label}"`);
    }
  }
  return result;
}

function runBuildTask(): Thenable<any> {
  const all = getAllTaskParams();
  for (const label of Object.keys(all)) {
    const params = all[label];
    if (params.build)
      return vscode.commands.executeCommand(
          'workbench.action.tasks.runTask', 'qcfg: ' + label);

    // XXX: executeTask not working (may be need to use fetchTAsks first)
    //   return vscode.tasks.executeTask(createTask(label, params));
  }
  return vscode.commands.executeCommand('workbench.action.tasks.build');
}

function findTerminal(task: vscode.Task): vscode.Terminal {
  let taskName = task.name;
  if (typeof task.scope === 'object' && 'name' in task.scope) {
    const wsFolder: vscode.WorkspaceFolder = task.scope;
        taskName = `${taskName} (${wsFolder.name})`;
  }
  for (const term of vscode.window.terminals) {
    // console.log('Terminal: ', term.name);
    if (term.name === 'Task - ' + taskName ||
        term.name === 'Task - qcfg: ' + taskName)
      return term;
  }
}

function onEndTaskProcess(event: vscode.TaskProcessEndEvent) {
  const task = event.execution.task;
  log.info(`Task process ${task.name} ended with exit code ${event.exitCode}`);
  console.log(`Ended task process with exit code ${event.exitCode}`, task);

  const params = task.definition.task as Params;
  const success = (event.exitCode === 0);
  if (params) {
    if (task.name in oneTimeTasks) {
      log.info(`One time task ${task.name} process ended`);
      const ctx = oneTimeTasks[task.name];
      if (success)
        ctx.resolve();
      else
        ctx.reject(event.exitCode);
      return;
    }
    if (success && params.reindex)
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
    const term = findTerminal(task);
    if (term) {
      switch (action) {
        case EndAction.None:
          break;
        case EndAction.Dispose:
          term.dispose();
          vscode.commands.executeCommand('workbench.action.closePanel');
          break;
        case EndAction.Hide:
          term.hide();
          vscode.commands.executeCommand('workbench.action.closePanel');
          break;
        case EndAction.Show:
          term.show();
          break;
        case EndAction.Notify:
          if (success)
            vscode.window.showInformationMessage(
                `Task "${task.name}" finished`);
          else
            vscode.window.showErrorMessage(`Task "${task.name}" failed`);
          break;
      }
    } else {  // no terminal
      // TODO: log error
    }
  }
}

const runningTasks: {[name: string]: vscode.StatusBarItem} = {};

function onTaskStart(event: vscode.TaskStartEvent) {
  const task = event.execution.task;
  const name = task.name;
  log.info(`Started task "${name}"`);
  if (name in runningTasks)
    return;
  if (task.isBackground)
    return;
  const status = vscode.window.createStatusBarItem();
  status.text = `$(tools)${name}`;
  status.show();
  runningTasks[name] = status;
}

function onTaskEnd(event: vscode.TaskEndEvent) {
  const task = event.execution.task;
  const name = task.name;
  log.info(`Ended task "${name}"`);

  if (!(name in runningTasks))
    return;

  const status = runningTasks[name];
  status.dispose();
  delete runningTasks[name];
  if (name in oneTimeTasks) {
    delete oneTimeTasks[name];
    const queue = taskQueue.getValue(name);
    if (!queue.isEmpty()) {
      const params = queue.dequeue();
      dequeueOneTime(name, params);
    }
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.tasks.registerTaskProvider('qcfg', {
    provideTasks: () => {
      return getQcfgTasks();
    },
    resolveTask(_task: vscode.Task): vscode.Task |
        undefined {
          return undefined;
        }
  }));
  context.subscriptions.push(
      vscode.commands.registerCommand('qcfg.tasks.build', runBuildTask));

  context.subscriptions.push(
      vscode.tasks.onDidEndTaskProcess(onEndTaskProcess));

  context.subscriptions.push(vscode.tasks.onDidStartTask(onTaskStart));

  context.subscriptions.push(vscode.tasks.onDidEndTask(onTaskEnd));

}
