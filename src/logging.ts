'use strict';

import * as vscode from 'vscode';
import {workspace, window} from 'vscode';

let outputChannel: vscode.OutputChannel;

enum LogLevel {
  Debug,
  Info,
  Notice,
  Warning,
  Error,
  Fatal
}

const LOG_LEVEL_STRINGS = ['DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR'];

export function str(x: any): string {
  switch (typeof x) {
    case 'object':
      return stringifyObject(x);
    default:
      return '' + x;
  }
}

function stringifyObject(x: object): string {
  if ('fileName' in x && 'uri' in x) {
    // TextDocument
    const doc = x as vscode.TextDocument;
    const relpath = workspace.asRelativePath(doc.fileName);
    return `<${relpath}>`;
  }
  else if (x instanceof vscode.Position) {
    const pos = x as vscode.Position;
    return `(${pos.line},${pos.character})`;
  }
  else if (x instanceof vscode.Range) {
    const range = x as vscode.Range;
    return `${str(range.start)}..${str(range.end)}`;
  }
  else {
    return JSON.stringify(x);
  }
}

export class Logger {

  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  private log(logLevel: LogLevel, ...args) {
    const msg = args.map(str).join(' ');
    const date = new Date();
    const dateStr = date.toLocaleTimeString(
        'en-US',
        {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'});
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    const level = LOG_LEVEL_STRINGS[logLevel];
    const line = `${dateStr}.${ms} ${level} [${this.module}] ${msg}`;
    outputChannel.appendLine(line);
    if (logLevel === LogLevel.Fatal) {
      const errorMsg = `[${this.module}] ${msg}`;
      throw new Error(errorMsg);
    }
  }

  info(...args) {
    this.log(LogLevel.Info, ...args);
  }
  debug(...args) {
    this.log(LogLevel.Debug, ...args);
  }
  error(...args) {
    this.log(LogLevel.Error, ...args);
  }
  fatal(...args) {
    this.log(LogLevel.Fatal, ...args);
  }
}


export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('qcfg');
}