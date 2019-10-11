'use strict';

import * as vscode from 'vscode';
import { Task, tasks } from 'vscode';
import { Disposable } from 'vscode-jsonrpc';
import { log, Logger } from './logging';
import { registerTemporaryCommand } from './utils';
import { listenWrapped } from './exception';
import { Modules } from './module';
import { Dictionary } from 'typescript-collections';
// import { Dictionary } from 'typescript-collections';

export enum State {
  INITIALIZED,
  WAITING,
  EXECUTED,
  RUNNING,
  PROCESS_STARTED,
  PROCESS_ENDED,
  DONE,
  ABORTED
}


/**
 * Two tasks with same descriptor can not run at the same time.
 *
 * TODO: While VSCode allows similiar tasks (e.g. same tasks in different
 * folders) to run together, onDid* events of them may receive same execution
 * object so we can't differentitate between them. That's why tasks potentially
 * having same execution object must have same descriptor so they won't run
 * together.
 */
class TaskDescriptor {
  name: string;
  constructor(task: Task) {
    this.name = task.name;
  }
  isEqual(other: TaskDescriptor) {
    return this.name === other.name;
  }
  toString() {
    return this.name;
  }
}

/**
 * What to do when there is already running
 * task with same @TaskDescriptor.
 */
export enum TaskConfilictPolicy {
  /** Abort current task */
  ABORT = 'Abort',
  /** Queue current task after the one currently running */
  WAIT = 'Wait',
  /** Cancel currently runninig task and run this task instead */
  CANCEL = 'Cancel'
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
  desc: TaskDescriptor;

  constructor(public task: Task) {
    this.state = State.INITIALIZED;
    this.log = new Logger({name: 'taskRun', parent: log, instance: task.name});
    this.desc = new TaskDescriptor(task);
  }

  async start(conflictPolicy?: TaskConfilictPolicy): Promise<void> {
    const previous = allRuns.getValue(this.desc);
    if (previous) {
      this.log.warn('Task already running');
      if (!conflictPolicy) {
        conflictPolicy =
            await vscode.window.showWarningMessage(
                `Task "${
                    this.task
                        .name} is already running. Would like to wait for it, cancel it or abort?`,
                {modal: true}, TaskConfilictPolicy.WAIT,
                TaskConfilictPolicy.CANCEL, TaskConfilictPolicy.ABORT) as
                TaskConfilictPolicy |
            undefined;
      }
      switch (conflictPolicy) {
        case undefined:
        case TaskConfilictPolicy.ABORT:
          this.state = State.ABORTED;
          throw Error(`Task "${this.task.name}" aborted`);
        case TaskConfilictPolicy.CANCEL:
          this.state = State.WAITING;
          await previous.cancel();
          break;
        case TaskConfilictPolicy.WAIT:
          this.state = State.WAITING;
          await previous.wait();
          break;
      }
    }
    allRuns.setValue(this.desc, this);
    this.state = State.EXECUTED;
    this.log.debug('Executing');
    this.execution = await vscode.tasks.executeTask(this.task);
    this.state = State.RUNNING;
    this.log.debug('Started');
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

  static findRunningTask(task: Task): TaskRun
      |undefined {
    for (const run of allRuns.values())
      if (run.task.name === task.name)
        return run;
    return;
  }

  // Private

  private static onDidEndTaskProcess(event: vscode.TaskProcessEndEvent) {
    const self = allRuns.getValue(new TaskDescriptor(event.execution.task))!;
    if (!self)
      return;
    self.exitCode = event.exitCode;
    self.state = State.PROCESS_ENDED;
    if (self.statusCmdDisposable)
      self.statusCmdDisposable!.dispose();
    if (self.status)
      self.status!.dispose();
    self.log.info(`Process ended with exitCode ${self.exitCode}`);
  }

  private static onDidStartTaskProcess(event: vscode.TaskProcessStartEvent) {
    const self = allRuns.getValue(new TaskDescriptor(event.execution.task))!;
    if (!self)
      return;
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
      self.status.text = '$(tools)' + self.desc.toString();
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
    const self = allRuns.getValue(new TaskDescriptor(event.execution.task))!;
    if (!self)
      return;
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
    allRuns.remove(self.desc);
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
  return undefined;
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

const allRuns = new Dictionary<TaskDescriptor, TaskRun>();