'use strict';

import * as child_process from 'child_process';

interface ExecResult  {
  code?: number;
  signal?: string;
  stdout: string;
  stderr: string;
}

interface ExecOptions {
  cwd?: string;
  env?: {[name: string]: string};
}

interface ExecError {
  code: number;
  signal?: number;
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
          child_process.exec(command, options, callback);
        else
          child_process.execFile(
              command[0], command.slice(1), options, callback);
      });
}