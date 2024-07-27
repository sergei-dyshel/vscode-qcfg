import type {
  ExtensionContext,
  OutputChannel,
  TextDocument,
  TextDocumentContentChangeEvent,
  TextEditor,
} from "vscode";
import {
  Location,
  Position,
  Range,
  Selection,
  Uri,
  window,
  workspace,
} from "vscode";
import {
  log,
  LogLevel,
  LogLevels,
  registerLogHandler,
  TextLogHandler,
} from "../../library/logging";
import { FileHandler } from "../../library/loggingHandlers";
import * as nodejs from "../../library/nodejs";
import { registerStringifier, stringify as str } from "../../library/stringify";
import type { SyntaxNode, TreeSitter } from "../../library/treeSitter";
import { extensionDebug } from "../utils/extensionContext";
import { GenericQuickPick } from "../utils/quickPick";
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from "./exception";
import { Modules } from "./module";

/**
 * Show log output panel
 *
 * Preserves focus by default.
 */
export function showLog(preserveFocus = true) {
  outputHandler.show(preserveFocus);
}

function stringifyTextEditor(editor: TextEditor) {
  const doc = editor.document;
  const relpath = workspace.asRelativePath(doc.fileName);
  if (editor.viewColumn) {
    return `<${relpath}(${editor.viewColumn})}>`;
  }
  return `<${relpath}>`;
}

// eslint-disable-next-line @typescript-eslint/ban-types
function stringifyVscode(x: object): string | undefined {
  if (x instanceof Uri) {
    if (x.scheme === "file") return workspace.asRelativePath(x);
    return x.toString(true /* skip encoding */);
  }
  if ("fileName" in x && "uri" in x) {
    // TextDocument
    const doc = x as TextDocument;
    const relpath = stringifyVscode(doc.uri);
    return `<${relpath}>`;
  }
  if ("document" in x && "viewColumn" in x) {
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
  if ("range" in x && "rangeOffset" in x && "rangeLength" in x && "text" in x) {
    const event = x as TextDocumentContentChangeEvent;
    return `${str(event.range)},${event.rangeOffset},${
      event.rangeLength
    }:${JSON.stringify(event.text)}`;
  }
  if ("row" in x && "column" in x) {
    // treeSitter.Point
    const point = x as TreeSitter.Point;
    return `(${point.row},${point.column})`;
  }
  if ("type" in x && "startPosition" in x && "endPosition" in x) {
    // treeSitter.SyntaxNode
    const node = x as SyntaxNode;
    return `<${node.type} ${str(node.range)}>`;
  }
  return undefined;
}

registerStringifier(stringifyVscode);

async function selectLevel(): Promise<LogLevel | undefined> {
  const qp = new GenericQuickPick<LogLevel>(
    (level) => ({
      label: LogLevels.toString(level),
    }),
    [...LogLevels.util.values()],
  );
  return qp.select();
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
    super("OutputPanel");
    const envLevel = LogLevels.fromString(
      process.env["VSCODE_QCFG_LOGLEVEL"] ?? "info",
    );
    this.level = envLevel === undefined ? LogLevel.INFO : envLevel;
    /// #if DEBUG
    this.level = LogLevel.DEBUG;
    /// #endif
    this.outputChannel = window.createOutputChannel("qcfg", "qcfg-log");
    for (const editor of window.visibleTextEditors) {
      if (editor.document.fileName.startsWith("extension-output"))
        this.show(true /* preserveFocus */);
    }
  }

  append(line: string) {
    this.outputChannel.appendLine(line);
  }

  show(preserveFocus?: boolean) {
    this.outputChannel.show(preserveFocus);
  }

  private readonly outputChannel: OutputChannel;
}

function getLogFileName() {
  const EXT = "vscode-qcfg.log";
  const wsFile = workspace.workspaceFile;
  if (wsFile && nodejs.fs.existsSync(wsFile.fsPath)) {
    const data = nodejs.path.parse(wsFile.fsPath);
    return `${data.dir}/.${data.name}.${EXT}`;
  }
  if (workspace.workspaceFolders) {
    const wsFolder = workspace.workspaceFolders[0].uri.fsPath;
    return `${wsFolder}/.${EXT}`;
  }
  return "/tmp/" + EXT;
}

let outputHandler: OutputChannelHandler;

function activate(context: ExtensionContext) {
  outputHandler = new OutputChannelHandler();
  const fileHandler = new FileHandler(getLogFileName());
  registerLogHandler(outputHandler);
  registerLogHandler(fileHandler);

  context.subscriptions.push(
    registerSyncCommandWrapped("qcfg.log.show", () => {
      showLog();
    }),
    registerAsyncCommandWrapped("qcfg.log.setHandlerLevel.output", async () =>
      promptForLevel(outputHandler),
    ),
    registerAsyncCommandWrapped("qcfg.log.setHandlerLevel.file", async () =>
      promptForLevel(fileHandler),
    ),
  );

  const mode = extensionDebug() ? "DEBUG" : "PRODUCTION";
  log.info(`${mode} mode`);
  log.info(
    `Logging to output panel on ${LogLevels.toString(
      outputHandler.level,
    )} level`,
  );
  log.info("Logging to file", fileHandler.fileName);
}

Modules.register(activate);
