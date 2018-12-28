'use strict';

import * as vscode from 'vscode';
import * as treeSitter from 'tree-sitter';
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

const LOG_LEVEL_STRINGS = ['DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR', 'FATAL'];

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
  else if ('document' in x && 'viewColumn' in x) {
    // TextEditor
    const editor = x as vscode.TextEditor;
    const doc = editor.document;
    const relpath = workspace.asRelativePath(doc.fileName);
    return `<${relpath}>`;
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
    return arr.map(str).join(',');
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
}


export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('qcfg');
}