'use strict';

import * as vscode from 'vscode';
import * as child_process from 'child_process';
import {log, Logger, LogLevel} from './logging';

const DEFAULT_LOG_LEVEL = LogLevel.Trace;

export class ExecResult extends Error {
  constructor(
      public pid: number, public stdout: string, public stderr: string) {
    super("");
    this.name = 'ExecResult';
    this.code = 0;
    this.signal = "";
    this.updateMessage();
  }
  code: number;
  signal: string;

  updateMessage() {
    this.message =
        `Process ${this.pid} exited with code: ${this.code}, signal: ${
            this.signal}, stdout: ${this.stdout}, stder: ${this.stderr}`;
  }
}

interface SubprocessOptions {
  cwd?: string;
  env?: {[name: string]: string};
  maxBuffer?: number;
  allowedCodes?: number[];
  statusBarMessage?: string;
  logLevel?: LogLevel;
}

export class Subprocess {
  constructor(command: string|string[], private options?: SubprocessOptions) {
    this.waitingContext = {resolve: (_) => {}, reject: (_) => {}};
    this.logLevel =
        (options && options.logLevel) ? options.logLevel : DEFAULT_LOG_LEVEL;
    if (typeof (command) === 'string')
      this.process =
          child_process.exec(command, options || {}, this.callback.bind(this));
    else
      this.process = child_process.execFile(
          command[0], command.slice(1), options || {},
          this.callback.bind(this));
    this.log = new Logger(
        {parent: log, instance: `pid=${this.process.pid}`, level: 'debug'});
    const cwd = (options && options.cwd) ? options.cwd : process.cwd;
    this.log.logStr(
        this.logLevel, 'started command "{}" in cwd "{}"', command, cwd);
    this.promise = new Promise<ExecResult>((resolve, reject) => {
      this.waitingContext = {resolve, reject};
    });
    if (this.options && this.options.statusBarMessage)
      vscode.window.setStatusBarMessage(
          this.options.statusBarMessage, this.promise);
  }

  wait(): Promise<ExecResult> {
    return this.promise;
  }

  kill(signal = 'SIGTERM') {
    this.log.log(this.logLevel, 'killing with {}', signal);
    this.process.kill(signal);
  }

  private callback(error: Error|null, stdout: string, stderr: string) {
    this.result = new ExecResult(this.process.pid, stdout, stderr);
    if (error) {
      const err = error as unknown as {code?: number, signal?: string};
      this.result.code = err.code || 0;
      this.result.signal = err.signal || "";
      this.log.log(
          this.logLevel,
          `finished with code ${this.result.code} signal ${
              this.result.signal}`);
      if (!this.options || !this.options.allowedCodes ||
          !this.options.allowedCodes.includes(this.result.code!)) {
        this.waitingContext.reject(this.result);
      } else {
        this.waitingContext.resolve(this.result);
      }
    } else {
      this.log.log(this.logLevel, `finished sucessfully`);
      this.waitingContext.resolve(this.result);
    }
  }

  private logLevel: LogLevel;
  private result?: ExecResult;
  private log: Logger;
  private promise: Promise<ExecResult>;
  private waitingContext: {
    resolve: (result: ExecResult) => void,
    reject: (result: ExecResult|Error) => void
  };
  private process: child_process.ChildProcess;
}

export function executeSubprocess(
    command: string|string[], options?: SubprocessOptions): Promise<ExecResult> {
  return new Subprocess(command, options).wait();
}