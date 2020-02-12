import { filterNonNull } from './tsUtils';
import { getCallsite } from './sourceMap';
import { formatString } from './stringUtils';
import { stringify as str } from './stringify';

export enum LogLevel {
  TRACE = 1,
  DEBUG = 2,
  INFO = 3,
  NOTICE = 4,
  WARNING = 5,
  ERROR = 6,
  FATAL = 7,
}

type LogLevelName = keyof typeof LogLevel;

export namespace LogLevels {
  export function toString(level: LogLevel) {
    return LogLevel[level] as LogLevelName;
  }

  export function fromString(s: string): LogLevel | undefined {
    return LogLevel[s.toUpperCase() as LogLevelName];
  }

  export function strings() {
    return Object.keys(LogLevel) as LogLevelName[];
  }
}

export interface LogRecord {
  /** Timestamp */
  date: string;
  /** Loglevel */
  level: LogLevel;
  /** Source file name + line number (+ optional column number) */
  location: string;
  /** Function name */
  function: string;
  /** Logger name */
  name?: string;
  /** Logger instance name */
  instance?: string;
  /** Log message */
  message: string;
}

export interface LogHandler {
  handle(record: LogRecord): void;
}

export function registerLogHandler(handler: LogHandler) {
  handlers.push(handler);
}

export interface LoggerOptions {
  /** Instance-specific name */
  instance?: string;
  /** Parent logger */
  parent?: Logger;
  /** Full logger name or subname if `parent` specified */
  name?: string;
}

export class Logger {
  constructor(options?: LoggerOptions) {
    if (options) {
      this.instance = options.instance;
      const comps = filterNonNull([options.parent?.name, options.name]);
      if (!comps.isEmpty) this.name = comps.join('.');
    }
  }

  log(level: LogLevel, ...args: unknown[]) {
    return this.logImpl(level, 3, formatMessage(args));
  }

  logStr(level: LogLevel, fmt: string, ...args: unknown[]) {
    return this.logImpl(level, 3, formatMessageStr(fmt, args));
  }

  trace(...args: unknown[]) {
    this.logInternal(LogLevel.TRACE, args);
  }

  traceStr(fmt: string, ...args: unknown[]) {
    this.logStrInternal(LogLevel.TRACE, fmt, args);
  }

  debug(...args: unknown[]) {
    this.logInternal(LogLevel.DEBUG, args);
  }

  debugStr(fmt: string, ...args: unknown[]) {
    this.logStrInternal(LogLevel.DEBUG, fmt, args);
  }

  info(...args: unknown[]) {
    this.logInternal(LogLevel.INFO, args);
  }

  infoStr(fmt: string, ...args: unknown[]) {
    this.logStrInternal(LogLevel.INFO, fmt, args);
  }

  notice(...args: unknown[]) {
    this.logInternal(LogLevel.NOTICE, args);
  }

  warn(...args: unknown[]) {
    this.logInternal(LogLevel.WARNING, args);
  }

  error(...args: unknown[]) {
    this.logInternal(LogLevel.ERROR, args);
  }

  fatal(...args: unknown[]): never {
    return this.logInternal(LogLevel.FATAL, args) as never;
  }

  // private

  private name?: string;
  private instance?: string;

  private logInternal(level: LogLevel, args: unknown[]) {
    return this.logImpl(level, 4, formatMessage(args));
  }

  private logStrInternal(level: LogLevel, fmt: string, args: unknown[]) {
    return this.logImpl(level, 4, formatMessageStr(fmt, args));
  }

  private logImpl(logLevel: LogLevel, callDepth: number, message: string) {
    const record: LogRecord = {
      message,
      level: logLevel,
      date: getDate(),
      name: this.name,
      instance: this.instance,
      ...getCallsite(callDepth),
    };
    for (const handler of handlers) handler.handle(record);
    if (logLevel === LogLevel.FATAL) {
      throw new Error(`[${this.name}] ${message}`);
    }
  }
}

/**
 * Root logger, can be used whenever name, instance are not overriden
 */
export const log = new Logger();

/**
 * On returning `true` log message should be appended, on `false` - dropped.
 * Otherwise proceed to next filter.
 */
export type LogFilter = (record: LogRecord) => boolean | undefined;

export interface LogFormatOptions {
  preset: 'all' | 'short';
}

/**
 * Minimal handler interface, with level filter and user-customizable filters
 */
export abstract class TextLogHandler implements LogHandler {
  filters: LogFilter[] = [];
  level: LogLevel = LogLevel.DEBUG;
  formatOptions?: LogFormatOptions;

  constructor(public name: string) {}

  /** Append formatted log message to stream */
  abstract append(formattedMsg: string, record: LogRecord): void;

  handle(record: LogRecord) {
    // skip logs with lower severity
    if (record.level < this.level) return;
    for (const filter of this.filters) if (!filter(record)) return;
    this.append(formatLogRecord(record, this.formatOptions), record);
  }
}

//
// Private
//

const handlers: LogHandler[] = [];

function formatMessage(args: unknown[], default_ = ''): string {
  return args.length === 0 ? default_ : args.map(str).join(' ');
}

function formatMessageStr(fmt: string, args: unknown[]) {
  const normalizedArgs = args.map(arg =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    typeof arg === 'object' ? str(arg) : (arg as any),
  );
  return formatString(fmt, ...normalizedArgs);
}

function getDate(): string {
  const date = new Date();
  const dateStr = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = String(date.getMilliseconds()).padStart(3, '0');
  return dateStr + '.' + ms;
}

function formatLogRecord(record: LogRecord, opts?: LogFormatOptions): string {
  const parts: string[] = [];
  const all = !opts || opts.preset === 'all';
  const short = true;
  if (all) parts.push(record.date);
  if (short) parts.push(LogLevels.toString(record.level));
  if (short) parts.push(record.location);
  if (all) parts.push(record.function + '()');
  if (all && record.name) parts.push(`[${record.name}]`);
  if (short && record.instance) parts.push(`{${record.instance}}`);
  parts.push(record.message);
  return parts.join(' ');
}
