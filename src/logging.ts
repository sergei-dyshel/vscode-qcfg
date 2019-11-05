'use strict';

import * as treeSitter from 'tree-sitter';
import {
  workspace,
  window,
  TextEditor,
  Uri,
  TextDocument,
  Location,
  Position,
  Selection,
  Range,
  TextDocumentContentChangeEvent,
  OutputChannel,
  languages,
  ExtensionContext
} from 'vscode';
import * as nodejs from './nodejs';
import { maxNumber } from './tsUtils';
import { selectStringFromList } from './dialog';
import {
  registerAsyncCommandWrapped,
  listenWrapped,
  registerSyncCommandWrapped,
  handleAsyncStd
} from './exception';
import { Modules } from './module';
import { getCallsite } from './sourceMap';
import { formatString } from './stringUtils';

type LogLevelStr = 'info' | 'debug' | 'trace';

export interface LoggerOptions {
  instance?: string;
  parent?: Logger;
  level?: LogLevel | LogLevelStr;
  name?: string;
}

export class Logger {
  constructor(options?: LoggerOptions) {
    this.name = '';
    if (options) {
      this.parent = options.parent;
      this.level =
        typeof options.level === 'string'
          ? strToLevel(options.level)
          : options.level;
      this.instance = options.instance;
      this.name = options.name || '';
    }
  }

  log(level: LogLevel, ...args: any[]) {
    if (level < this.resolveLevel()) return;
    return this.logImpl(level, 3, formatMessage(args));
  }
  logStr(level: LogLevel, fmt: string, ...args: any[]) {
    if (level < this.resolveLevel()) return;
    return this.logImpl(level, 3, formatMessageStr(fmt, args));
  }
  private logInternal(level: LogLevel, args: any[]) {
    if (level < this.resolveLevel()) return;
    return this.logImpl(level, 4, formatMessage(args));
  }
  private logStrInternal(level: LogLevel, fmt: string, args: any[]) {
    if (level < this.resolveLevel()) return;
    return this.logImpl(level, 4, formatMessageStr(fmt, args));
  }
  trace(...args: any[]) {
    this.logInternal(LogLevel.Trace, args);
  }
  traceStr(fmt: string, ...args: any[]) {
    this.logStrInternal(LogLevel.Trace, fmt, args);
  }
  debug(...args: any[]) {
    this.logInternal(LogLevel.Debug, args);
  }
  debugStr(fmt: string, ...args: any[]) {
    this.logStrInternal(LogLevel.Debug, fmt, args);
  }
  info(...args: any[]) {
    this.logInternal(LogLevel.Info, args);
  }
  infoStr(fmt: string, ...args: any[]) {
    this.logStrInternal(LogLevel.Info, fmt, args);
  }
  notice(...args: any[]) {
    this.logInternal(LogLevel.Notice, args);
  }
  warn(...args: any[]) {
    this.logInternal(LogLevel.Warning, args);
  }
  error(...args: any[]) {
    this.logInternal(LogLevel.Error, args);
  }
  fatal(...args: any[]): never {
    return this.logInternal(LogLevel.Fatal, args) as never;
  }
  assert(condition: boolean | undefined | null | object, ...args: any[]) {
    if (!condition) {
      throw new Error(formatMessage(args, 'Assertion failed'));
    }
  }
  assertNonNull<T>(val: T | undefined | null, ...args: any[]): T {
    this.assert(val !== undefined && val !== null, ...args);
    return val as T;
  }
  assertNull<T>(val: T | undefined | null, ...args: any[]) {
    this.assert(val === undefined || val === null, ...args);
  }

  assertInstanceOf<T extends B, B>(
    value: B,
    cls: { new (...args: any[]): T },
    ...args: any[]
  ): T {
    this.assert(value instanceof cls, ...args);
    return value as T;
  }

  // private

  private name: string;
  private parent?: Logger;
  private level?: LogLevel;
  private instance?: string;

  private fullName(): string {
    const parentName = this.parent ? this.parent.fullName() : '';
    if (parentName === '') return this.name;
    if (this.name === '') return parentName;
    return `${parentName}.${this.name}`;
  }

  private resolveLevel(): LogLevel {
    return maxNumber(
      this.level || globalLevel,
      this.parent ? this.parent.resolveLevel() : globalLevel
    );
  }

  private logImpl(logLevel: LogLevel, callDepth: number, message: string) {
    const record: LogRecord = {
      message,
      level: logLevel,
      date: getDate(),
      name: this.fullName(),
      instance: this.instance,
      ...getCallsite(callDepth)
    };
    for (const handler of handlers) handler.handleIfNeeded(record);
    if (logLevel === LogLevel.Warning) {
      // tslint:disable-next-line: no-floating-promises
      window.showWarningMessage(message);
    } else if (logLevel === LogLevel.Error) {
      // tslint:disable-next-line: no-floating-promises
      window.showErrorMessage(
        message.split('\n')[0] + ' [Show log](command:qcfg.log.show)'
      );
    }
    if (logLevel === LogLevel.Fatal) {
      const errorMsg = `[${this.fullName}] ${message}`;
      console.trace(errorMsg);
      throw new Error(errorMsg);
    }
  }
}

// root logger
export const log = new Logger();

export enum LogLevel {
  Trace = 1,
  Debug = 2,
  Info = 3,
  Notice = 4,
  Warning = 5,
  Error = 6,
  Fatal = 7
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
let globalLevel: LogLevel = LogLevel.Debug;

const LOG_LEVEL_STRINGS = [
  '',
  'TRACE',
  'DEBUG',
  'INFO',
  'NOTICE',
  'WARN',
  'ERROR',
  'FATAL'
];

function levelToStr(level: LogLevel) {
  return LOG_LEVEL_STRINGS[level];
}

function updateGlobalLevel() {
  if (handlers.isEmpty) return;
  const prev = globalLevel;
  globalLevel = handlers.map(handler => handler.level).min()!;
  if (globalLevel !== prev)
    log.info(
      `Changed global level ${levelToStr(prev)} => ${levelToStr(globalLevel)}`
    );
}

function strToLevel(s: string): LogLevel | undefined {
  const idx = LOG_LEVEL_STRINGS.indexOf(s.toUpperCase());
  if (idx !== -1) return idx as LogLevel;
  return undefined;
}

function formatMessage(args: any[], default_ = ''): string {
  return args.length === 0 ? default_ : args.map(str).join(' ');
}

function formatMessageStr(fmt: string, args: any[]) {
  const normalizedArgs = args.map(arg => {
    return typeof arg === 'object' ? stringifyObject(arg) : arg;
  });
  return formatString(fmt, ...normalizedArgs);
}

function getDate(): string {
  const date = new Date();
  const dateStr = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return dateStr + '.' + ms;
}

function stringifyTextEditor(editor: TextEditor) {
  const doc = editor.document;
  const relpath = workspace.asRelativePath(doc.fileName);
  if (editor.viewColumn) {
    return `<${relpath}(${editor.viewColumn})}>`;
  }
  return `<${relpath}>`;
}

function stringifyObject(x: object): string {
  if (x instanceof Uri) {
    return x.scheme === 'file' ? x.fsPath : x.toString();
  }
  if ('fileName' in x && 'uri' in x) {
    // TextDocument
    const doc = x as TextDocument;
    const relpath = workspace.asRelativePath(doc.fileName);
    return `<${relpath}>`;
  }
  if ('document' in x && 'viewColumn' in x) {
    // TextEditor
    return stringifyTextEditor(x as TextEditor);
  }
  if (x instanceof Location) {
    return `<${str(x.uri)}${str(x.range)}>`;
  }
  if (x instanceof Position) {
    return `(${x.line},${x.character})`;
  }
  if (x instanceof Selection) {
    const sel = x;
    if (sel.anchor.isEqual(sel.active)) return stringifyObject(sel.anchor);
    if (sel.anchor.isBefore(sel.active))
      return `${str(sel.anchor)}->${str(sel.active)}`;
    return `${str(sel.active)}<-${str(sel.anchor)}`;
  }
  if (x instanceof Error) {
    return `${x.message}: ${x.name}`;
  }
  if (x instanceof Range) {
    if (x.start.isEqual(x.end)) return stringifyObject(x.start);
    return `[${str(x.start)}..${str(x.end)}]`;
  }
  if ('range' in x && 'rangeOffset' in x && 'rangeLength' in x && 'text' in x) {
    const event = x as TextDocumentContentChangeEvent;
    return `${str(event.range)},${event.rangeOffset},${
      event.rangeLength
    }:${JSON.stringify(event.text)}`;
  }
  if ('row' in x && 'column' in x) {
    // treeSitter.Point
    const point = x as treeSitter.Point;
    return `(${point.row},${point.column})`;
  }
  if ('type' in x && 'startPosition' in x && 'endPosition' in x) {
    // treeSitter.SyntaxNode
    const node = x as treeSitter.SyntaxNode;
    return `<${node.type} ${str(node.range)}>`;
  }
  if (x instanceof Array) {
    const arr = x;
    return '[ ' + arr.map(str).join(', ') + ' ]';
  }
  if ('toString' in x) {
    const s = x.toString();
    if (s !== '[object Object]') return s;
  }
  return JSON.stringify(x);
}

interface LogRecord {
  date: string;
  level: LogLevel;
  location: string;
  function: string;
  name: string;
  instance?: string;
  message: string;
  formatted?: string;
}

class Handler {
  constructor(private name: string, public level: LogLevel) {}

  handleIfNeeded(record: LogRecord) {
    if (record.level < this.level) return;
    this.handle(record);
  }

  async promptForLevel() {
    const level = await selectLevel();
    if (level !== undefined) {
      this.level = level;
      log.info(`Set handler "${this.name}" log level to ${levelToStr(level)}`);
      updateGlobalLevel();
    }
  }

  protected handle(_: LogRecord) {}
}

function formatRecord(record: LogRecord): string {
  if (record.formatted) return record.formatted;
  const level = levelToStr(record.level);
  const pathStr = record.name !== '' ? `[${record.name}]` : '';
  const instanceStr = record.instance ? `{${record.instance}}` : '';
  record.formatted = `${record.date} ${level} ${record.location} ${record.function}() ${pathStr} ${instanceStr} ${record.message}`;
  return record.formatted;
}

class OutputChannelHandler extends Handler {
  constructor() {
    const envLevel = strToLevel(process.env.VSCODE_QCFG_LOGLEVEL || 'info');
    let level = envLevel !== undefined ? envLevel : LogLevel.Info;
    /// #if DEBUG
    level = LogLevel.Debug;
    /// #endif
    super('OutputPanel', level);
    this.outputChannel = window.createOutputChannel('qcfg');
    for (const editor of window.visibleTextEditors) {
      if (editor.document.fileName.startsWith('extension-output')) this.show();
    }
  }
  handle(record: LogRecord) {
    this.outputChannel.appendLine(formatRecord(record));
  }
  show() {
    this.outputChannel.show();
  }
  private outputChannel: OutputChannel;
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
    this.logFuncs.get(record.level)('<qcfg> ' + record.message);
  }
}

class FileHandler extends Handler {
  readonly fileName: string;
  private fd?: number;
  private EXT = 'vscode-qcfg.log';
  constructor() {
    super('File', LogLevel.Debug);
    const wsFile = workspace.workspaceFile;
    if (wsFile) {
      const data = nodejs.path.parse(wsFile.fsPath);
      this.fileName = `${data.dir}/.${data.name}.${this.EXT}`;
    } else if (workspace.workspaceFolders) {
      const wsFolder = workspace.workspaceFolders[0].uri.fsPath;
      this.fileName = `${wsFolder}/.${this.EXT}`;
    } else {
      this.fileName = '/tmp/' + this.EXT;
    }
    this.fd = nodejs.fs.openSync(this.fileName, 'w');
  }
  handle(record: LogRecord) {
    if (!this.fd) return;
    nodejs.fs.write(this.fd, formatRecord(record) + '\n', error => {
      if (error) {
        log.error('Could not write to log file, closing the file');
        nodejs.fs.close(this.fd!, () => {});
        this.fd = undefined;
      }
    });
  }
}

const handlers: Handler[] = [];

function onDidChangeVisibleTextEditors(editors: TextEditor[]) {
  for (const editor of editors) {
    if (!editor.document.fileName.startsWith('extension-output')) continue;
    if (editor.document.lineAt(0).text.includes(FIRST_LINE_ID))
      handleAsyncStd(
        languages.setTextDocumentLanguage(editor.document, 'qcfg-log')
      );
    else
      handleAsyncStd(languages.setTextDocumentLanguage(editor.document, 'Log'));
  }
}

async function selectLevel(): Promise<LogLevel | undefined> {
  const levelStr = await selectStringFromList(LOG_LEVEL_STRINGS);
  if (!levelStr) return;
  return strToLevel(levelStr);
}

function activate(context: ExtensionContext) {
  const outputHandler = new OutputChannelHandler();
  handlers.push(outputHandler);
  const consoleHandler = new ConsoleHandler();
  handlers.push(consoleHandler);
  const fileHandler = new FileHandler();
  handlers.push(fileHandler);

  context.subscriptions.push(
    listenWrapped(
      window.onDidChangeVisibleTextEditors,
      onDidChangeVisibleTextEditors
    ),
    registerSyncCommandWrapped('qcfg.log.show', () => outputHandler.show()),
    registerAsyncCommandWrapped('qcfg.log.setHandlerLevel.output', () =>
      outputHandler.promptForLevel()
    ),
    registerAsyncCommandWrapped('qcfg.log.setHandlerLevel.file', () =>
      outputHandler.promptForLevel()
    ),
    registerAsyncCommandWrapped('qcfg.log.setHandlerLevel.console', () =>
      consoleHandler.promptForLevel()
    )
  );

  log.info(FIRST_LINE_ID);
  updateGlobalLevel();
  /// #if DEBUG
  log.info('DEBUG mode');
  /// #else
  log.info('PRODUCTION mode');
  /// #endif
  log.info(
    `Logging to output panel on ${levelToStr(outputHandler.level)} level`
  );
  log.info('Logging to file', fileHandler.fileName);
  onDidChangeVisibleTextEditors(window.visibleTextEditors);
}

Modules.register(activate);
