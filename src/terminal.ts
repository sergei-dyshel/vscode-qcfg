'use strict';

import * as vscode from 'vscode';
import * as logging from './logging';
import * as remoteControl from './remoteControl';
import { toString } from 'typescript-collections/dist/lib/arrays';
import {parseNumber} from './stringUtils';

const log = logging.Logger.create('terminal');

let nextId = 0;

interface TerminalProcessOptions {
  cwd?: string;
  env?: {[name: string]: string|null};
}

class TerminalProcess {
  constructor(
      name: string, command: string|string[],
      readonly options?: TerminalProcessOptions) {
    this.genId = nextId;
    nextId += 1;
    const fullCmd = (typeof (command) === 'string') ?
        ['/bin/bash', '-c', command] :
        command;
    const shellArgs =
        [remoteControl.port.toString(), this.genId.toString(), ...fullCmd];
    const opts: vscode.TerminalOptions = {
      name,
      env: (options ? options.env : undefined),
      cwd: (options ? options.cwd : undefined),
      shellPath: '/home/sergei/qyron-config/scripts/vscode-run-in-terminal.sh',
      shellArgs
    };
    this.terminal = vscode.window.createTerminal(opts);
    TerminalProcess.activeProcesses.push(this);
  }

  wait(): Promise<number> {
    if (this.waitingContext)
      return this.waitingContext.promise;
    const promise = new Promise<number>(
        (resolve: (exitCode: number) => void, reject: (err: any) => void) => {
          this.waitingContext = {promise, resolve, reject};
        });
    return promise;
  }

  static readonly activeProcesses: TerminalProcess[] = [];

  static processExit(args: string[]) {
    const genId = parseNumber(args[0]);
    const exitCode = parseNumber(args[1]);
    for (let i = 0; i < TerminalProcess.activeProcesses.length; ++i) {
      const process = TerminalProcess.activeProcesses[i];
      if (process.genId === genId) {
        process.exitCode = exitCode;
        if (process.waitingContext)
          process.waitingContext.resolve(exitCode);
        TerminalProcess.activeProcesses.splice(i, 1);
        return;
      }
    }
    log.fatal(`No active process with genId=${genId}`);
  }

  readonly terminal: vscode.Terminal;

  exitCode?: number;

  private genId: number;

  private waitingContext?: {
    promise: Promise<number>,
    resolve: (exitCode: number) => void,
    reject: (err: any) => void
  };
}

export function processExit(args: string[])
{

}