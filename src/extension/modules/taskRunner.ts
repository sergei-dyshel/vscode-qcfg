'use strict';

import { Dictionary } from 'typescript-collections';
import type {
  Task,
  TaskExecution,
  Terminal,
  StatusBarItem,
  ExtensionContext,
  TaskProcessEndEvent,
  TaskProcessStartEvent,
  TaskEndEvent,
  WorkspaceFolder,
} from 'vscode';
import { tasks, window, TaskScope } from 'vscode';
import { listenWrapped, executeCommandHandled } from './exception';
import { log, Logger } from '../../library/logging';
import { Modules } from './module';
import { registerSyncTemporaryCommand } from './utils';
import type { DisposableLike } from '../../library/types';
import { assert } from '../../library/exception';

export enum State {
  INITIALIZED,
  WAITING,
  EXECUTED,
  RUNNING,
  PROCESS_STARTED,
  PROCESS_ENDED,
  DONE,
  ABORTED,
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
  ABORT_CURRENT = 'Abort current',
  /** Queue current task after the one currently running */
  WAIT = 'Wait',
  /** Cancel currently runninig task and run this task instead */
  CANCEL_PREVIOUS = 'Cancel previous',
}

export class TaskRun {
  state: State;
  execution?: TaskExecution;
  exitCode?: number;
  pid?: number;
  terminal?: Terminal;
  cancelled = false;
  status?: StatusBarItem;
  statusCmdDisposable?: DisposableLike;
  desc: TaskDescriptor;

  constructor(public task: Task) {
    this.state = State.INITIALIZED;
    this.log = new Logger({
      name: 'taskRun',
      parent: log,
      instance: task.name,
    });
    this.desc = new TaskDescriptor(task);
  }

  async start(conflictPolicy?: TaskConfilictPolicy): Promise<void> {
    const previous = allRuns.getValue(this.desc);
    if (previous) {
      if (!conflictPolicy) {
        conflictPolicy = (await window.showWarningMessage(
          `Task "${this.task.name} is already running. Would like to wait for it, cancel it or abort?`,
          { modal: true },
          TaskConfilictPolicy.WAIT,
          TaskConfilictPolicy.CANCEL_PREVIOUS,
          TaskConfilictPolicy.ABORT_CURRENT,
        )) as TaskConfilictPolicy | undefined;
      }
      switch (conflictPolicy) {
        case undefined:
        case TaskConfilictPolicy.ABORT_CURRENT:
          this.state = State.ABORTED;
          throw Error(`Task "${this.task.name}" aborted`);
        case TaskConfilictPolicy.CANCEL_PREVIOUS:
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
    try {
      this.execution = await tasks.executeTask(this.task);
    } catch (err: unknown) {
      this.log.debug('executeTask failed: ', err);
      allRuns.remove(this.desc);
      return;
    }
    this.state = State.RUNNING;
    this.log.debug('Started');
  }

  async wait(): Promise<void> {
    if (this.waitingPromise) return this.waitingPromise;
    this.waitingPromise = new Promise(
      (resolve: () => void, reject: (err: Error) => void) => {
        this.waitingContext = { resolve, reject };
      },
    );
    return this.waitingPromise;
  }

  async cancel() {
    assert(
      this.state === State.RUNNING || this.state === State.PROCESS_STARTED,
      `Can not cancel task in state ${State[this.state]}`,
    );
    this.log.info('Cancelled');
    this.cancelled = true;
    this.execution!.terminate();
    try {
      await this.wait();
    } catch (err: unknown) {
      if (err instanceof TaskCancelledError) return;
      throw err;
    }
  }

  static activate(context: ExtensionContext) {
    context.subscriptions.push(
      listenWrapped(tasks.onDidEndTaskProcess, TaskRun.onDidEndTaskProcess),
      listenWrapped(tasks.onDidStartTaskProcess, TaskRun.onDidStartTaskProcess),
      listenWrapped(tasks.onDidEndTask, TaskRun.onDidEndTask),
    );
  }

  static findRunningTask(task: Task): TaskRun | undefined {
    for (const run of allRuns.values())
      if (run.task.name === task.name) return run;
    return;
  }

  // Private

  private static onDidEndTaskProcess(event: TaskProcessEndEvent) {
    const self = allRuns.getValue(new TaskDescriptor(event.execution.task));
    if (!self) return;
    self.exitCode = event.exitCode;
    self.state = State.PROCESS_ENDED;
    if (self.statusCmdDisposable) self.statusCmdDisposable.dispose();
    if (self.status) self.status.dispose();
    self.log.info(`Process ended with exitCode ${self.exitCode}`);
  }

  private static onDidStartTaskProcess(event: TaskProcessStartEvent) {
    const self = allRuns.getValue(new TaskDescriptor(event.execution.task));
    if (!self) return;
    self.pid = event.processId;
    self.state = State.PROCESS_STARTED;
    self.log.info(`Process started with pid ${self.pid}`);
    self.terminal = findTaskTerminal(self.task);
    if (!self.task.isBackground) {
      self.status = window.createStatusBarItem();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const { command, disposable } = registerSyncTemporaryCommand(() => {
        if (self.terminal) self.terminal.show();
      });
      if (
        self.task.scope &&
        self.task.scope !== TaskScope.Global &&
        self.task.scope !== TaskScope.Workspace
      )
        self.status.text = `$(tools)${self.task.name} (${self.task.scope.name})`;
      else self.status.text = '$(tools)' + self.task.name;
      self.status.command = command;
      self.statusCmdDisposable = disposable;
      self.status.show();
    }
    if (self.terminal && window.activeTerminal === self.terminal) {
      executeCommandHandled('workbench.action.terminal.scrollToBottom');
    }
  }

  private static onDidEndTask(event: TaskEndEvent) {
    const self = allRuns.getValue(new TaskDescriptor(event.execution.task));
    if (!self) return;
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

  private readonly log: Logger;
  private waitingPromise?: Promise<void>;
  private waitingContext?: {
    resolve: () => void;
    reject: (err: Error) => void;
  };
}

function findTaskTerminal(task: Task): Terminal | undefined {
  const taskName = task.name;
  let wsTaskName = taskName;
  const cands: string[] = [];
  if (typeof task.scope === 'object' && 'name' in task.scope) {
    const wsFolder: WorkspaceFolder = task.scope;
    wsTaskName = `${taskName} (${wsFolder.name})`;
  }
  for (const name of [taskName, wsTaskName])
    cands.push('Task - ' + name, 'Task - qcfg: ' + name);
  for (const term of window.terminals) {
    for (const cand of cands) if (term.name === cand) return term;
  }
  return undefined;
}

export class TaskCancelledError extends Error {
  constructor(taskName: string) {
    super(`Task ${taskName} was cancelled`);
  }

  name = 'TaskCancelledError';
}

function activate(context: ExtensionContext) {
  TaskRun.activate(context);
}

Modules.register(activate);

const allRuns = new Dictionary<TaskDescriptor, TaskRun>();
