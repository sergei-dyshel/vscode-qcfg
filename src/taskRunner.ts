'use strict';

import * as vscode from 'vscode';
import {window, workspace, commands, Task, TaskExecution, tasks} from 'vscode';

import {Logger, str} from './logging';

const log = Logger.create('taskRunner');

export enum State {
  QUEUED,
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

  private constructor(public task: Task) {
    this.state = State.QUEUED;
  }
  async start(): Promise<void> {
    this.state = State.EXECUTED;
    this.execution = await vscode.tasks.executeTask(this.task);
    this.state = State.RUNNING;
  }

  wait(): Promise<void> {
    if (this.waitingPromise)
      return this.waitingPromise;
    this.waitingPromise = new Promise((resolve: () => void, reject: (err: Error) => void) => {
      this.waitingContext = {resolve, reject};
    });
    return this.waitingPromise;
  }

  private static onDidEndTaskProcess(event: vscode.TaskProcessEndEvent) {
    if (!allRuns.has(event.execution))
      return;
    const run = allRuns.get(event.execution)!;
    run.exitCode = event.exitCode;
    run.state = State.PROCESS_ENDED;
  }

  private static onDidStartTaskProcess(event: vscode.TaskProcessStartEvent) {
    if (!allRuns.has(event.execution))
      return;
    const run = allRuns.get(event.execution)!;
    run.pid = event.processId;
    run.state = State.PROCESS_STARTED;
  }

  private static onDidEndTask(event: vscode.TaskEndEvent) {
    if (!allRuns.has(event.execution))
      return;
    const run = allRuns.get(event.execution)!;
    run.state = State.DONE;
    if (run.waitingContext)
      run.waitingContext.resolve();
  }

  static activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
      tasks.onDidEndTaskProcess(TaskRun.onDidEndTaskProcess),
      tasks.onDidStartTaskProcess(TaskRun.onDidStartTaskProcess),
      tasks.onDidEndTask(TaskRun.onDidStartTaskProcess)
    );
  }

  private waitingPromise?: Promise<void>;
  private waitingContext?: {resolve: () => void, reject: (err: Error) => void};
}

export function activate(context: vscode.ExtensionContext) {
  TaskRun.activate(context);
}

const allRuns = new Map<TaskExecution, TaskRun>();