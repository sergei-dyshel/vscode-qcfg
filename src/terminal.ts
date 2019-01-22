'use strict';

import * as vscode from 'vscode';
import * as logging from './logging';
import * as remoteControl from './remoteControl';
import { toString } from 'typescript-collections/dist/lib/arrays';

const log = new logging.Logger('terminal');

const nextId = 0;
const contexts = new Map<number, Context>();

interface Return {
  terminal: vscode.Terminal;
  exitCode: number;
}

interface Context {
  terminal: vscode.Terminal;
  resolve: (ret: Return) => void;
  reject: (err: any) => void;
}

export function runInTerminal(
    name: string, command: string|string[],
    options?: {cwd?: string, env?: {[name: string]: string|null}}):
    Promise<Return> {
  const shellArgs =
      (typeof (command) === 'string') ? ['/bin/bash', '-c', command] : command;
  const opts: vscode.TerminalOptions = {
    name,
    env: (options ? options.env : undefined),
    cwd: (options ? options.cwd : undefined),
    shellPath: '/home/sergei/qyron-config/scripts/vscode-run-in-terminal.sh',
    shellArgs
  };
  const terminal = vscode.window.createTerminal(opts);
  return new Promise(
      (resolve: (ret: Return) => void, reject: (err: any) => undefined) => {
        contexts[nextId] = {terminal, reject, resolve};
      });
}


export function processExit(args: string[])
{

}