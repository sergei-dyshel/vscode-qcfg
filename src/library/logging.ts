import { enumUtil } from "./enum";
import { getCallsite } from "./sourceMap";
import { formatMessage } from "./stringify";
import { filterNonNull } from "./tsUtils";

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
  export const util = enumUtil(LogLevel);

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

export type LogInstance = string | (() => string);

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
  instance?: LogInstance;
  /** Log message */
  message: string;
}

export interface LogHandler {
  handle: (record: LogRecord) => void;
}

export function registerLogHandler(handler: LogHandler) {
  handlers.push(handler);
}

export interface LoggerOptions {
  /** Instance-specific name */
  instance?: LogInstance;
  /** Parent logger */
  parent?: Logger;
  /** Full logger name or subname if `parent` specified */
  name?: string;
}

export class Logger {
  instance?: LogInstance;

  constructor(options?: LoggerOptions) {
    if (options) {
      this.instance = options.instance;
      const comps = filterNonNull([options.parent?.name, options.name]);
      if (!comps.isEmpty) this.name = comps.join(".");
    }
  }

  log(level: LogLevel, ...args: unknown[]) {
    this.logImpl(level, 3, formatMessage(args));
  }

  trace(...args: unknown[]) {
    this.logInternal(LogLevel.TRACE, args);
  }

  debug(...args: unknown[]) {
    this.logInternal(LogLevel.DEBUG, args);
  }

  info(...args: unknown[]) {
    this.logInternal(LogLevel.INFO, args);
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
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    return this.logInternal(LogLevel.FATAL, args) as never;
  }

  // private

  private readonly name?: string;

  private logInternal(level: LogLevel, args: unknown[]) {
    this.logImpl(level, 4, formatMessage(args));
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
      throw new Error(this.name ? `[${this.name}] ${message}` : message);
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
  preset: "all" | "short";
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

function getDate(): string {
  const date = new Date();
  const dateStr = date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const ms = String(date.getMilliseconds()).padStart(3, "0");
  return dateStr + "." + ms;
}

function formatLogRecord(record: LogRecord, opts?: LogFormatOptions): string {
  const parts: string[] = [];
  const all = !opts || opts.preset === "all";
  if (all) parts.push(record.date);
  parts.push(LogLevels.toString(record.level), record.location);
  if (all) parts.push(record.function + "()");
  if (all && record.name) parts.push(`[${record.name}]`);
  if (record.instance) {
    const instance =
      typeof record.instance === "string" ? record.instance : record.instance();
    parts.push(`{${instance}}`);
  }
  parts.push(record.message);
  return parts.join(" ");
}
