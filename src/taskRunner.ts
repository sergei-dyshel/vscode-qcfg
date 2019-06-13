'use strict';

import * as vscode from 'vscode';
import { Task, TaskExecution, tasks } from 'vscode';
import { Disposable } from 'vscode-jsonrpc';
import { log, Logger } from './logging';
import { registerTemporaryCommand } from './utils';
import { listenWrapped } from './exception';
import { Modules } from './module';

export enum State {
  INITIALIZED,
  EXECUTED,
  RUNNING,
  PROCESS_STARTED,
  PROCESS_ENDED,
  DONE
}

export class TaskRun {
  state: State;
  execution?: vscode.TaskExecution;
  exitCode?: number;
  pid?: number;
  terminal?: vscode.Terminal;
  cancelled = false;
  status?: vscode.StatusBarItem;
  statusCmdDisposable?: Disposable;

  constructor(public task: Task) {
    this.state = State.INITIALIZED;
    this.log = new Logger({name: 'taskRun', parent: log, instance: task.name});
  }

  async start(): Promise<void> {
    this.state = State.EXECUTED;
    this.log.debug('Executing');
    this.execution = await vscode.tasks.executeTask(this.task);
    this.state = State.RUNNING;
    this.log.debug('Started');
    allRuns.set(this.execution, this);
  }

  wait(): Promise<void> {
    if (this.waitingPromise)
      return this.waitingPromise;
    this.waitingPromise = new Promise((resolve: () => void, reject: (err: Error) => void) => {
      this.waitingContext = {resolve, reject};
    });
    return this.waitingPromise;
  }

  async cancel() {
    this.log.assert(
        this.state === State.RUNNING || this.state === State.PROCESS_STARTED,
        `Can not cancel task in state ${State[this.state]}`);
    this.log.info('Cancelled');
    this.cancelled = true;
    this.execution!.terminate();
    try {
      await this.wait();
    }
    catch (err) {
      if (this.cancelled && (err instanceof TaskCancelledError))
        return;
      throw err;
    }
  }

  static activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        listenWrapped(tasks.onDidEndTaskProcess, TaskRun.onDidEndTaskProcess),
        listenWrapped(
            tasks.onDidStartTaskProcess, TaskRun.onDidStartTaskProcess),
        listenWrapped(tasks.onDidEndTask, TaskRun.onDidEndTask));
  }

  static findRunningTask(name: string): TaskRun | undefined {
    for (const run of allRuns.values())
      if (run.task.name === name)
        return run;
    return;
  }

  // Private

  private static onDidEndTaskProcess(event: vscode.TaskProcessEndEvent) {
    if (!allRuns.has(event.execution))
      return;
    const self = allRuns.get(event.execution)!;
    self.exitCode = event.exitCode;
    self.state = State.PROCESS_ENDED;
    if (self.statusCmdDisposable)
      self.statusCmdDisposable!.dispose();
    if (self.status)
      self.status!.dispose();
    self.log.info(`Process ended with exitCode ${self.exitCode}`);
  }

  private static onDidStartTaskProcess(event: vscode.TaskProcessStartEvent) {
    if (!allRuns.has(event.execution))
      return;
    const self = allRuns.get(event.execution)!;
    self.pid = event.processId;
    self.state = State.PROCESS_STARTED;
    self.log.info(`Process started with pid ${self.pid}`);
    self.terminal = findTaskTerminal(self.task);
    if (!self.task.isBackground) {
      self.status = vscode.window.createStatusBarItem();
      const {command, disposable} = registerTemporaryCommand(() => {
        if (self.terminal)
          self.terminal.show();
      });
      self.status.text = '$(tools)' + self.task.name;
      self.status.command = command;
      self.statusCmdDisposable = disposable;
      self.status.show();
    }
    if (self.terminal && vscode.window.activeTerminal === self.terminal) {
      vscode.commands.executeCommand(
          'workbench.action.terminal.scrollToBottom');
    }
  }

  private static onDidEndTask(event: vscode.TaskEndEvent) {
    if (!allRuns.has(event.execution))
      return;
    const self = allRuns.get(event.execution)!;
    self.state = State.DONE;
    if (self.waitingContext) {
      if (self.cancelled) {
        self.log.debug('Ended (cancelled)');
        self.waitingContext.reject(new TaskCancelledError(self.task.name));
      } else {
        self.log.debug('Ended');
        self.waitingContext.resolve();
      }
    }
    allRuns.delete(event.execution);
  }

  private log: Logger;
  private waitingPromise?: Promise<void>;
  private waitingContext?: {resolve: () => void, reject: (err: Error) => void};
}

function findTaskTerminal(task: Task): vscode.Terminal | undefined {
  const taskName = task.name;
  let wsTaskName = taskName;
  const cands: string[] = [];
  if (typeof task.scope === 'object' && 'name' in task.scope) {
    const wsFolder: vscode.WorkspaceFolder = task.scope;
    wsTaskName = `${taskName} (${wsFolder.name})`;
  }
  for (const name of [taskName, wsTaskName])
    cands.push('Task - ' + name, 'Task - qcfg: ' + name);
  for (const term of vscode.window.terminals) {
    for (const cand of cands)
      if (term.name === cand)
        return term;
  }
}

export class TaskCancelledError extends Error {
  constructor(taskName: string) {
    super(`Task ${taskName} was cancelled`);
  }
  name = 'TaskCancelledError';
}

function activate(context: vscode.ExtensionContext) {
  TaskRun.activate(context);
}

Modules.register(activate);

const allRuns = new Map<TaskExecution, TaskRun>();