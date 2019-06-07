'use strict';

import * as vscode from 'vscode';
import * as treeSitter from 'tree-sitter';
import {workspace} from 'vscode';
import * as callsites from 'callsites';
import * as sourceMapSupport from 'source-map-support';
import * as nodejs from './nodejs';
import { maxValue } from './tsUtils';
import { selectStringFromList } from './dialog';
import { registerCommandWrapped, listenWrapped } from './exception';


export interface LoggerOptions {
  instance?: string;
  parent?: Logger;
  level?: LogLevel;
  name: string;
}

export class Logger {
  constructor(options?: LoggerOptions) {
    this.name = '';
    if (options) {
      this.parent = options.parent;
      this.level = options.level;
      this.instance = options.instance;
      this.name = options.name || '';
    }
  }

  trace(...args: any[]) {
    this._log(LogLevel.Trace, 3, ...args);
  }
  info(...args: any[]) {
    this._log(LogLevel.Info, 3, ...args);
  }
  notice(...args: any[]) {
    this._log(LogLevel.Notice, 3, ...args);
  }
  warn(...args: any[]) {
    this._log(LogLevel.Warning, 3, ...args);
  }
  debug(...args: any[]) {
    this._log(LogLevel.Debug, 3, ...args);
  }
  error(...args: any[]) {
    this._log(LogLevel.Error, 3, ...args);
  }
  fatal(...args: any[]): never {
    return this._log(LogLevel.Fatal, 3, args) as never;
  }
  assert(condition, ...args) {
    if (!condition) {
      throw new Error(formatMessage(args, "Assertion failed"));
    }
  }
  assertNonNull<T>(val: T | undefined | null, ...args): T {
    this.assert(val !== undefined && val !== null, ...args);
    return val as T;
  }
  assertNull<T>(val: T | undefined | null, ...args) {
    this.assert(val === undefined || val === null, ...args);
  }

  assertInstanceOf<T extends B, B>(
      value: B, class_: {new(...args: any[]): T}, ...args): T {
    this.assert(value instanceof class_, ...args);
    return value as T;
  }

  // private

  private name: string;
  private parent?: Logger;
  private level?: LogLevel;
  private instance?: string;

  private fullName(): string {
    const parentName = this.parent ? this.parent.fullName() : '';
    if (parentName === '')
      return this.name;
    if (this.name === '')
      return parentName;
    return `${parentName}.${this.name}`;
  }

  private resolveLevel(): LogLevel {
    return maxValue(
        (this.level || defaultLogLevel),
        (this.parent ? this.parent.resolveLevel() : defaultLogLevel));
  }

  private _log(logLevel: LogLevel, callDepth: number, ...message: any[]) {
    if (logLevel < this.resolveLevel())
      return;
    const msgStr = formatMessage(message);
    const record: LogRecord = {
      level: logLevel,
      date: getDate(),
      name: this.fullName(),
      instance: this.instance,
      message,
      messageStr: msgStr,
      ...getCallsite(callDepth)
    };
    for (const handler of handlers)
      handler.handleIfNeeded(record);
    if (logLevel === LogLevel.Notice)
      vscode.window.setStatusBarMessage(msgStr, 3);
    if (logLevel === LogLevel.Warning)
      vscode.window.showWarningMessage(msgStr);
    else if (logLevel === LogLevel.Error) {
      vscode.window.showErrorMessage(
          msgStr.split('\n')[0] + ' [Show log](command:qcfg.log.show)');
    }
    if (logLevel === LogLevel.Fatal) {
      const errorMsg = `[${this.fullName}] ${msgStr}`;
      console.trace(errorMsg);
      throw new Error(errorMsg);
    }
  }
}

// root logger
export const log = new Logger();

export enum LogLevel {
  Trace,
  Debug,
  Info,
  Notice,
  Warning,
  Error,
  Fatal
}

export function str(x: any): string {
  switch (typeof x) {
    case 'object':
      return stringifyObject(x);
    default:
      return '' + x;
  }
}


export class LoggedError extends Error {}

///////////////////////////////////////////////////////////////////////////////
// private
///////////////////////////////////////////////////////////////////////////////

const FIRST_LINE_ID = '{vscode-qcfg.log}';
const defaultLogLevel: LogLevel = LogLevel.Debug;

const LOG_LEVEL_STRINGS =
    ['TRACE', 'DEBUG', 'INFO', 'NOTICE', 'WARN', 'ERROR', 'FATAL'];

function levelToStr(level: LogLevel) {
  return LOG_LEVEL_STRINGS[level];
}

function strToLevel(s: string): LogLevel|undefined {
  const idx = LOG_LEVEL_STRINGS.indexOf(s);
  if (idx !== -1)
    return idx as LogLevel;
}

function formatMessage(args: any[], default_ = ''): string {
  return args.length === 0 ? default_ : args.map(String).join(' ');
}

function getDate(): string {
  const date = new Date();
  const dateStr = date.toLocaleTimeString(
      'en-US',
      {hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'});
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return dateStr + '.' + ms;
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
  else if (x instanceof vscode.Uri) {
    if (x.scheme === 'file')
      return x.fsPath;
    else
      return x.toString();
  }
  else if (x instanceof vscode.Location) {
    return `<${str(x.uri)}${str(x.range)}>`;
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
    if (x.start.isEqual(x.end))
      return stringifyObject(x.start);
    return `[${str(x.start)}..${str(x.end)}]`;
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

interface LogRecord {
  date: string;
  level: LogLevel;
  location: string;
  function: string;
  name: string;
  instance?: string;
  message: any[];
  messageStr: string;
  formatted?: string;
}

class Handler {
  constructor(private name: string, private level: LogLevel) {}

  handleIfNeeded(record: LogRecord) {
    if (record.level < this.level)
      return;
    this.handle(record);
  }

  async promptForLevel() {
    const level = await selectLevel();
    if (level) {
      this.level = level;
      log.info(`Set handler "${this.name}" log level to ${levelToStr(level)}`);
    }
  }

  protected handle(_: LogRecord) {}
}

function formatRecord(record: LogRecord): string
{
    if (record.formatted)
      return record.formatted;
    const level = levelToStr(record.level);
    const pathStr = record.name !== '' ? `[${record.name}]` : '';
    const instanceStr = record.instance ? `{${record.instance}}` : '';
    record.formatted = `${record.date} ${level} ${record.location} ${
        record.function}() ${pathStr} ${instanceStr} ${record.messageStr}`;
    return record.formatted;
}

class OutputChannelHandler extends Handler {
  constructor() {
    const level =
        'VSCODE_QCFG_DEBUG' in process.env ? LogLevel.Debug : LogLevel.Info;
    super('OutputPanel', level);
    this.outputChannel = vscode.window.createOutputChannel('qcfg');
  }
  handle(record: LogRecord) {
    this.outputChannel.appendLine(formatRecord(record));
  }
  show() {
    this.outputChannel.show();
  }
  private outputChannel: vscode.OutputChannel;
}

class ConsoleHandler extends Handler {
  private logFuncs = new Map<LogLevel, any>();
  constructor() {
    super('Console', LogLevel.Warning);
    this.logFuncs.set(LogLevel.Trace, console.debug);
    this.logFuncs.set(LogLevel.Debug, console.debug);
    this.logFuncs.set(LogLevel.Info, console.info);
    this.logFuncs.set(LogLevel.Notice, console.info);
    this.logFuncs.set(LogLevel.Warning, console.warn);
    this.logFuncs.set(LogLevel.Error, console.error);
    this.logFuncs.set(LogLevel.Fatal, console.error);
  }
  handle(record: LogRecord) {
    let prefix =
        `%c${record.location} ${record.function}() %c[qcfg.${record.name}]`;
    const cssArgs: string[] = ["color: magenta", "color: blue"];
    if (record.instance) {
      prefix += ` %c{${record.instance}}`;
      cssArgs.push('color: green');
    }
    this.logFuncs.get(record.level)(prefix, ...cssArgs, ...record.message);
  }
}

class FileHandler extends Handler {
  readonly fileName: string;
  private fd?: number;
  private EXT = 'vscode-qcfg.log';
  constructor() {
    super('File', LogLevel.Debug);
    const wsFile = vscode.workspace.workspaceFile;
    if (wsFile) {
      const data = nodejs.path.parse(wsFile.fsPath);
      this.fileName = `${data.dir}/.${data.name}.${this.EXT}`;
    }
    else if (vscode.workspace.workspaceFolders) {
      const wsFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
      this.fileName = `${wsFolder}/.${this.EXT}`;
    }
    else {
      this.fileName = '/tmp/' + this.EXT;
    }
    this.fd = nodejs.fs.openSync(this.fileName, 'w');
  }
  handle(record: LogRecord) {
    if (!this.fd)
      return;
    nodejs.fs.write(this.fd, formatRecord(record) + '\n', (error) => {
      if (error) {
        log.error('Could not write to log file, closing the file');
        nodejs.fs.close(this.fd!, () => {});
        this.fd = undefined;
      }
    });
  }
}

const handlers: Handler[] = [];

function getCallsite(frame: number) {
  const site = callsites()[frame];
  const jsPos: sourceMapSupport.Position = {
    source: site.getFileName()!,
    line: site.getLineNumber()!,
    column: site.getColumnNumber()!
  };
  const funcName = site.getFunctionName() || '';
  const tsPos = sourceMapSupport.mapSourcePosition(jsPos);
  const basename = nodejs.path.basename(tsPos.source);
  return {
    location: `${basename}:${tsPos.line}:${tsPos.column}`,
    function: funcName
  };
}

function onDidChangeVisibleTextEditors(editors: vscode.TextEditor[]) {
  vscode.commands.executeCommand('editor.action.showHover', 'blabla');
  for (const editor of editors) {
    if (editor.document.fileName.startsWith('extension-output'))
      if (editor.document.lineAt(0).text.includes(FIRST_LINE_ID))
        vscode.languages.setTextDocumentLanguage(editor.document, 'qcfg-log');
      else
        vscode.languages.setTextDocumentLanguage(editor.document, 'Log');
  }
}

async function selectLevel(): Promise<LogLevel|undefined> {
  const levelStr = await selectStringFromList(LOG_LEVEL_STRINGS);
  if (!levelStr)
    return;
  return strToLevel(levelStr);
}

export function activate(context: vscode.ExtensionContext) {
  const outputHandler = new OutputChannelHandler();
  handlers.push(outputHandler);
  const consoleHandler = new ConsoleHandler();
  handlers.push(consoleHandler);
  const fileHandler = new FileHandler();
  handlers.push(fileHandler);

  context.subscriptions.push(
      listenWrapped(
          vscode.window.onDidChangeVisibleTextEditors,
          onDidChangeVisibleTextEditors),
      registerCommandWrapped('qcfg.log.show', () => outputHandler.show()),
      registerCommandWrapped(
          'qcfg.log.setHandlerLevel.output',
          () => outputHandler.promptForLevel()),
      registerCommandWrapped(
          'qcfg.log.setHandlerLevel.file',
          () => outputHandler.promptForLevel()),
      registerCommandWrapped(
          'qcfg.log.setHandlerLevel.console',
          () => consoleHandler.promptForLevel()));

  log.info(FIRST_LINE_ID);
  log.info('Logging to file', fileHandler.fileName);
}