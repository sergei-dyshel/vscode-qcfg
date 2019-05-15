'use strict';

import * as child_process from 'child_process';
import * as logging from './logging';


const moduleLog =
    logging.Logger.create('subprocess');

export interface ExecResult  {
  code?: number;
  signal?: string;
  stdout: string;
  stderr: string;
}

interface ExecOptions {
  cwd?: string;
  env?: {[name: string]: string};
  maxBuffer?: number;
}

export class Subprocess {
  constructor(command: string|string[], options?: ExecOptions) {
    if (typeof (command) === 'string')
      this.process =
          child_process.exec(command, options, this.callback.bind(this));
    else
      this.process = child_process.execFile(
          command[0], command.slice(1), options, this.callback.bind(this));
    this.log = logging.Logger.create(
        'Subprocess', {parent: moduleLog, instance: `pid=${this.process.pid}`});
    this.log.debug(`started command ${command}`);
  }

  result: ExecResult | undefined;
  log: logging.Logger;

  wait(): Promise<ExecResult> {
    if (this.result)
      return Promise.resolve(this.result);
    if (this.waitingContext)
      return this.promise!;
    else {
      this.promise = new Promise<ExecResult>((resolve, reject) => {
        this.waitingContext = {resolve, reject};
      });
      return this.promise;
    }
  }

  kill(signal = 'SIGTERM') {
    this.log.debug(`killing with ${signal}`);
    this.process.kill(signal);
  }

  private callback(error: Error|null, stdout: string, stderr: string) {
    this.result = {stdout, stderr};
    if (error instanceof Error) {
      this.log.debug(`failed with message ${error.message}`);
      if (this.waitingContext)
        this.waitingContext.reject(this.result);
      return;
    }
    const err = error as unknown as {code?: number, signal?: string};
    if (err) {
      this.result.code = err.code;
      this.result.signal = err.signal;
    }
    if (error) {
      this.log.debug(`failed with code ${err.code} signal ${err.signal}`);
      if (this.waitingContext)
        this.waitingContext.reject(this.result);
    } else {
      this.log.debug(`finished sucessfully`);
      if (this.waitingContext)
        this.waitingContext.resolve(this.result);
    }
  }

  promise?: Promise<ExecResult>;
  private waitingContext?: {
    resolve: (result: ExecResult) => void,
    reject: (result: ExecResult|Error) => void
  };
  private process: child_process.ChildProcess;
}

export async function exec(
    command: string|string[], options?: ExecOptions): Promise<ExecResult> {
  return new Promise(
      (resolve: (res: ExecResult) => void,
       reject: (res: ExecResult) => void) => {
        const callback =
            (error: Error|null, stdout: string, stderr: string) => {
              const res: ExecResult = {stdout, stderr};
              const err = error as unknown as {code?: number, signal?: string};
              if (err) {
                res.code = err.code;
                res.signal = err.signal;
              }
              if (error)
                reject(res);
              else
                resolve(res);
            };
        if (typeof(command) === 'string')
          this.process = child_process.exec(command, options, callback);
        else
          this.process = child_process.execFile(
              command[0], command.slice(1), options, callback);
      });
}