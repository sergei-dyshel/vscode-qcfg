'use strict';

import * as vscode from 'vscode';
import * as treeSitter from 'tree-sitter';
import {workspace} from 'vscode';

let outputChannel: vscode.OutputChannel;

export enum LogLevel {
  NoLog,
  Trace,
  Debug,
  Info,
  Notice,
  Warning,
  Error,
  Fatal
}

let defaultLogLevel: LogLevel = LogLevel.Info;

const LOG_LEVEL_STRINGS =
    ['', 'TRACE', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR', 'FATAL'];

export function str(x: any): string {
  switch (typeof x) {
    case 'object':
      return stringifyObject(x);
    default:
      return '' + x;
  }
}

function stringifyTextEditor(editor: vscode.TextEditor)
{
    const doc = editor.document;
    const relpath = workspace.asRelativePath(doc.fileName);
    if (editor.viewColumn)
      return `<${relpath}(${editor.viewColumn})}>`;
    else
      return `<${relpath}>`;
}

function stringifyObject(x: object): string {
  if ('fileName' in x && 'uri' in x) {
    // TextDocument
    const doc = x as vscode.TextDocument;
    const relpath = workspace.asRelativePath(doc.fileName);
    return `<${relpath}>`;
  }
  else if ('document' in x && 'viewColumn' in x) {
    // TextEditor
    return stringifyTextEditor(x as vscode.TextEditor);
  }
  else if (x instanceof vscode.Position) {
    const pos = x as vscode.Position;
    return `(${pos.line},${pos.character})`;
  }
  else if (x instanceof vscode.Selection) {
    const sel = x as vscode.Selection;
    return `${str(sel.anchor)}->${str(sel.active)}`;
  }
  else if (x instanceof vscode.Range) {
    const range = x as vscode.Range;
    return `${str(range.start)}..${str(range.end)}`;
  }
  else if ('row' in x && 'column' in x) {
    // treeSitter.Point
    const point = x as treeSitter.Point;
    return `(${point.row},${point.column})`;
  }
  else if ('type' in x && 'startPosition' in x && 'endPosition' in x) {
    // treeSitter.SyntaxNode
    const node = x as treeSitter.SyntaxNode;
    return `<${node.type} ${str(node.startPosition)} - ${str(node.endPosition)}>`;
  }
  else if (x instanceof Array) {
    const arr = x as any[];
    return arr.map(str).join(', ');
  }
  else {
    return JSON.stringify(x);
  }
}

export interface LoggerOptions {
  instance?: string;
  parent?: Logger;
  level?: LogLevel;
}

export class Logger {
  private constructor(private path: string, options?: LoggerOptions) {
    if (options) {
      this.parent = options.parent;
      this.level = options.level;
      this.instance = options.instance;
    }
  }

  parent?: Logger;
  level?: LogLevel;
  instance?: string;

  static create(path: string, options?: LoggerOptions) {
    return new Logger(path, options);
  }

  get fullPath(): string {
    return (!this.parent || !this.parent.fullPath) ?
        this.path :
        `${this.parent.fullPath}.${this.path}`;
  }

  private resolveLevel(): LogLevel {
    return this.level ||
        (this.parent ? this.parent.resolveLevel() : defaultLogLevel);
  }

  private log(logLevel: LogLevel, ...args) {
    if (logLevel < this.resolveLevel())
      return;
    const msg = args.map(str).join(' ');
    const date = new Date();
    const dateStr = date.toLocaleTimeString(
        'en-US',
        {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'});
    const ms = String(date.getMilliseconds()).padStart(3, '0');
    const level = LOG_LEVEL_STRINGS[logLevel];
    const instanceStr = this.instance ? `{${this.instance}} ` : '';
    const line =
        `${dateStr}.${ms} ${level} [${this.fullPath}] ${instanceStr}${msg}`;
    if (logLevel === LogLevel.Warning)
      vscode.window.showWarningMessage(msg);
    else if (logLevel === LogLevel.Error)
      vscode.window.showErrorMessage(msg);
    if (outputChannel)
      outputChannel.appendLine(line);
    else
      console.error('Using logging before activation');
    if (logLevel === LogLevel.Fatal) {
      const errorMsg = `[${this.fullPath}] ${msg}`;
      throw new Error(errorMsg);
    }
  }

  trace(...args) {
    this.log(LogLevel.Trace, ...args);
  }
  info(...args) {
    this.log(LogLevel.Info, ...args);
  }
  warn(...args) {
    this.log(LogLevel.Warning, ...args);
  }
  debug(...args) {
    this.log(LogLevel.Debug, ...args);
  }
  error(...args) {
    this.log(LogLevel.Error, ...args);
  }
  fatal(...args): never {
    return this.log(LogLevel.Fatal, ...args) as never;
  }
  assert(condition, ...args) {
    if (!condition) {
      if (args.length > 0)
        this.fatal(...args);
      else
        this.fatal("Assertion failed");
    }
  }
  assertNonNull<T>(val: T | undefined | null, ...args): T {
    this.assert(val !== undefined && val !== null, ...args);
    return val as T;
  }
  assertNull<T>(val: T | undefined | null, ...args) {
    this.assert(val === undefined || val === null, ...args);
  }
}

function setLevel(level: LogLevel) {
  return () => {
    defaultLogLevel = level;
    log.warn(`Log level set to ${LOG_LEVEL_STRINGS[defaultLogLevel]}`);
  };
}

let log: Logger;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('qcfg');
  context.subscriptions.push(
      vscode.commands.registerCommand(
          'qcfg.log.toggleDebug', setLevel(LogLevel.Debug)),
      vscode.commands.registerCommand(
          'qcfg.log.toggleInfo', setLevel(LogLevel.Info)),
      vscode.commands.registerCommand(
          'qcfg.log.toggleTrace', setLevel(LogLevel.Trace)));

          log = Logger.create('logging');
  if ('VSCODE_QCFG_DEBUG' in process.env) {
    defaultLogLevel = LogLevel.Debug;
    log.info(`Detected as being debugged, setting log level to debug`);
  }
}