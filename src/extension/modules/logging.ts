'use strict';

import {
  workspace,
  window,
  TextEditor,
  OutputChannel,
  languages,
  ExtensionContext,
  Uri,
  TextDocument,
  Location,
  Position,
  Selection,
  Range,
  TextDocumentContentChangeEvent,
} from 'vscode';
import * as nodejs from '../../library/nodejs';
import { selectStringFromList } from './dialog';
import {
  registerAsyncCommandWrapped,
  listenWrapped,
  registerSyncCommandWrapped,
  handleAsyncStd,
} from './exception';
import { Modules } from './module';
import {
  TextLogHandler,
  log,
  LogLevel,
  LogLevels,
  registerLogHandler,
} from '../../library/logging';
import { FileHandler } from '../../library/loggingHandlers';
import { stringify as str, registerStringifier } from '../../library/stringify';
import * as treeSitter from 'tree-sitter';

const FIRST_LINE_ID = '{vscode-qcfg.log}';

function stringifyTextEditor(editor: TextEditor) {
  const doc = editor.document;
  const relpath = workspace.asRelativePath(doc.fileName);
  if (editor.viewColumn) {
    return `<${relpath}(${editor.viewColumn})}>`;
  }
  return `<${relpath}>`;
}

function stringifyVscode(x: object): string | undefined {
  if (x instanceof Uri) {
    if (x.scheme === 'file') return workspace.asRelativePath(x);
    return x.toString(true /* skip encoding */);
  }
  if ('fileName' in x && 'uri' in x) {
    // TextDocument
    const doc = x as TextDocument;
    const relpath = stringifyVscode(doc.uri);
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
    if (sel.anchor.isEqual(sel.active)) return stringifyVscode(sel.anchor);
    if (sel.anchor.isBefore(sel.active))
      return `${str(sel.anchor)}->${str(sel.active)}`;
    return `${str(sel.active)}<-${str(sel.anchor)}`;
  }
  if (x instanceof Range) {
    if (x.start.isEqual(x.end)) return stringifyVscode(x.start);
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
  return undefined;
}

registerStringifier(stringifyVscode);

async function selectLevel(): Promise<LogLevel | undefined> {
  const levelStr = await selectStringFromList(LogLevels.strings());
  if (!levelStr) return;
  return LogLevels.fromString(levelStr);
}

async function promptForLevel(handler: TextLogHandler) {
  const level = await selectLevel();
  if (level !== undefined) {
    handler.level = level;
    log.info(
      `Set handler "${handler.name}" log level to ${LogLevels.toString(level)}`,
    );
  }
}

class OutputChannelHandler extends TextLogHandler {
  constructor() {
    super('OutputPanel');
    const envLevel = LogLevels.fromString(
      process.env.VSCODE_QCFG_LOGLEVEL || 'info',
    );
    this.level = envLevel !== undefined ? envLevel : LogLevel.INFO;
    /// #if DEBUG
    this.level = LogLevel.DEBUG;
    /// #endif
    this.outputChannel = window.createOutputChannel('qcfg');
    for (const editor of window.visibleTextEditors) {
      if (editor.document.fileName.startsWith('extension-output')) this.show();
    }
  }

  append(line: string) {
    this.outputChannel.appendLine(line);
  }

  show() {
    this.outputChannel.show();
  }

  private outputChannel: OutputChannel;
}

function getLogFileName() {
  const EXT = 'vscode-qcfg.log';
  const wsFile = workspace.workspaceFile;
  if (wsFile) {
    const data = nodejs.path.parse(wsFile.fsPath);
    return `${data.dir}/.${data.name}.${EXT}`;
  }
  if (workspace.workspaceFolders) {
    const wsFolder = workspace.workspaceFolders[0].uri.fsPath;
    return `${wsFolder}/.${EXT}`;
  }
  return '/tmp/' + EXT;
}

function onDidChangeVisibleTextEditors(editors: TextEditor[]) {
  for (const editor of editors) {
    if (!editor.document.fileName.startsWith('extension-output')) continue;
    if (editor.document.lineAt(0).text.includes(FIRST_LINE_ID))
      handleAsyncStd(
        languages.setTextDocumentLanguage(editor.document, 'qcfg-log'),
      );
    else
      handleAsyncStd(languages.setTextDocumentLanguage(editor.document, 'Log'));
  }
}

function activate(context: ExtensionContext) {
  const outputHandler = new OutputChannelHandler();
  const fileHandler = new FileHandler(getLogFileName());
  registerLogHandler(outputHandler);
  registerLogHandler(fileHandler);

  context.subscriptions.push(
    listenWrapped(
      window.onDidChangeVisibleTextEditors,
      onDidChangeVisibleTextEditors,
    ),
    registerSyncCommandWrapped('qcfg.log.show', () => outputHandler.show()),
    registerAsyncCommandWrapped('qcfg.log.setHandlerLevel.output', () =>
      promptForLevel(outputHandler),
    ),
    registerAsyncCommandWrapped('qcfg.log.setHandlerLevel.file', () =>
      promptForLevel(fileHandler),
    ),
  );

  log.info(FIRST_LINE_ID);
  /// #if DEBUG
  log.info('DEBUG mode');
  /// #else
  log.info('PRODUCTION mode');
  /// #endif
  log.info(
    `Logging to output panel on ${LogLevels.toString(
      outputHandler.level,
    )} level`,
  );
  log.info('Logging to file', fileHandler.fileName);
  onDidChangeVisibleTextEditors(window.visibleTextEditors);
}

Modules.register(activate);
