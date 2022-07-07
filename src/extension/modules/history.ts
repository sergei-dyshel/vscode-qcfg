import type {
  ExtensionContext,
  StatusBarItem,
  TextDocumentChangeEvent,
  TextEditor,
  ViewColumn,
} from 'vscode';
import {
  commands,
  StatusBarAlignment,
  SymbolKind,
  ThemeColor,
  window,
  workspace,
} from 'vscode';
import { assert, assertNotNull, check } from '../../library/exception';
import { log, Logger } from '../../library/logging';
import type { AsyncFunction, PromiseType } from '../../library/templateTypes';
import { DefaultMap } from '../../library/tsUtils';
import { documentRangePreview } from '../utils/document';
import { QuickPickLocations } from '../utils/quickPick';
import { getContainingSymbol, qualifiedName } from '../utils/symbol';
import { getBesideViewColumn } from '../utils/window';
import { getCachedDocumentSymbols } from './documentSymbolsCache';
import { listenAsyncWrapped, registerAsyncCommandWrapped } from './exception';
import { LiveLocationBasedArray, LivePosition } from './liveLocation';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';
import { getVisibleEditor } from './windowUtils';

const MAX_HISTORY_SIZE = 20;

/**
 * Update location before and after awaiting the given promise, which is
 * expected to jump to new location.
 *
 * @param column View column to monitor for changes, defaults to active column.
 * @param onlyWhenChanged Only update history if there was a jump.
 */
export async function updateHistory<T>(
  jump: Promise<T>,
  options?: {
    column?: ViewColumn;
    onlyWhenChanged?: boolean;
  },
): Promise<T> {
  let column = options?.column;
  if (!column) {
    column = window.activeTextEditor?.viewColumn;
    if (!column) return jump;
  }
  const beforeEditor = getVisibleEditor(column);
  const before = beforeEditor
    ? await HistoryItem.fromEditor(beforeEditor)
    : undefined;
  try {
    return await jump;
  } finally {
    const afterEditor = getVisibleEditor(column);
    const after = afterEditor
      ? await HistoryItem.fromEditor(afterEditor)
      : undefined;
    if (
      !options?.onlyWhenChanged ||
      (after && before && !before.equals(after))
    ) {
      if (before) getHistory(column).push(before);
      if (after) getHistory(column).push(after);
    }
  }
}

/**
 * Wrap async function with {@link updateHistory}
 */
export function wrapWithHistoryUpdate<T extends AsyncFunction>(
  func: T,
): (...funcArgs: Parameters<T>) => Promise<PromiseType<ReturnType<T>>> {
  return async (...args: Parameters<T>): Promise<PromiseType<ReturnType<T>>> =>
    updateHistory(func(...args));
}

// Private

function getHistory(column: ViewColumn) {
  return histories.get(column);
}

function getActiveColumn() {
  const editor = getActiveTextEditor();
  const viewCol = editor.viewColumn;
  assertNotNull(viewCol, 'Current text editor has no view column');
  return viewCol;
}

async function goBackward() {
  await getHistory(getActiveColumn()).goBackward();
}

async function goForward() {
  const editor = getActiveTextEditor();
  await getHistory(getActiveColumn()).goForward(editor);
}

export class HistoryItem {
  location!: LivePosition;
  preview!: string;

  get position() {
    return this.location.position;
  }

  private constructor() {}

  static async fromEditor(editor: TextEditor) {
    const position = editor.selection.active;
    const document = editor.document;
    const item = new HistoryItem();
    const symbols = await getCachedDocumentSymbols(document.uri);
    if (symbols) {
      const symbol = getContainingSymbol(position.asRange, symbols);
      if (symbol) {
        item.preview = [
          SymbolKind.labelIcon(symbol.kind),
          qualifiedName(symbol, document.languageId),
        ].join(' ');
      }
    }
    if (!item.preview)
      item.preview = documentRangePreview(
        document,
        position.asRange,
        undefined,
        8,
      )[0];
    item.location = new LivePosition(document, position);
    return item;
  }

  toString(): string {
    return this.location.toString();
  }

  equals(other: HistoryItem) {
    return this.position.isEqual(other.position);
  }
}

class History {
  constructor(private readonly viewColumn: ViewColumn) {
    const editor = getVisibleEditor(viewColumn);
    assertNotNull(editor);
    this.log = new Logger({
      name: 'viewColumnHistory',
      parent: log,
      instance: viewColumn.toString(),
    });
  }

  /** Push current position to forward history and go backward */
  async goBackward() {
    await this.prepareForBrowsing();
    check(this.cursor < this.items.length - 1, 'Reached end of history');
    this.cursor += 1;
    const prev = this.items.get(this.cursor);
    this.log.debug(`Going backward to ${prev}`);
    this.updateStatusBar();
    await this.show(prev);
  }

  /** Reset history navigation */
  reset() {
    statusBar.hide();
    while (this.cursor > 0) {
      this.items.shift();
      this.cursor -= 1;
    }
    /* TODO: clear status bar */
  }

  private async show(item: HistoryItem) {
    await item.location.show({ viewColumn: this.viewColumn });
  }

  async goForward(editor: TextEditor) {
    assert(editor.viewColumn === this.viewColumn);
    check(this.cursor > 0, 'Top of history');
    this.cursor += 1;
    const next = this.items.get(this.cursor);
    this.log.debug(`Going forward to ${next}`);
    if (this.cursor > 0) this.updateStatusBar();
    else statusBar.hide();
    await this.show(next);
  }

  private updateStatusBar() {
    // -1 because top item is "current" location
    statusBar.text = `history: ${this.cursor} / ${this.items.length - 1}`;
    statusBar.show();
  }

  get top(): HistoryItem | undefined {
    return this.items.top;
  }

  push(item: HistoryItem) {
    this.reset();
    const { top } = this;
    if (top && Math.abs(top.position.line - item.position.line) <= 4) {
      this.items.shift();
      this.items.unshift(item);
      this.log.debug(`Replaced top with ${item}`);
    } else {
      this.items.unshift(item);
      this.log.debug(`Pushed ${item}`);
      while (this.items.length > MAX_HISTORY_SIZE) this.items.pop();
    }
  }

  async pushCurrent() {
    const editor = getVisibleEditor(this.viewColumn);
    assert(!!editor, 'Not in editor');
    this.push(await HistoryItem.fromEditor(editor));
  }

  async prepareForBrowsing() {
    check(this.items.length > 0, 'No backward history');
    if (this.cursor === 0) {
      await this.pushCurrent();
    }
  }

  getItems() {
    return [...this.items];
  }

  private readonly log: Logger;
  cursor = 0;
  private readonly items = new LiveLocationBasedArray<HistoryItem>();
}

const histories = new DefaultMap<ViewColumn, History>(
  (col) => new History(col),
);

async function updateHistoryOnCommand(cmd: string) {
  await updateHistory(commands.executeCommand(cmd));
}

async function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const editor = window.activeTextEditor;
  if (!editor) return;
  if (editor.document !== event.document) return;
  const column = editor.viewColumn;
  if (!column) return;
  const history = getHistory(column);
  await history.pushCurrent();
}

async function peekOpenReference() {
  return updateHistory(commands.executeCommand('openReference'));
}

async function peekOpenReferenceToSide() {
  return updateHistory(commands.executeCommand('openReferenceToSide'), {
    column: getBesideViewColumn(),
  });
}

async function quickPickHistory() {
  const column = window.tabGroups.activeTabGroup.viewColumn;
  const history = getHistory(column);
  await history.prepareForBrowsing();
  const items = history.getItems();
  let activeIdx = history.cursor;

  const qp = new QuickPickLocations<HistoryItem>(
    (item) => ({
      label: item.preview,
      description: workspace.asRelativePath(item.location.uri),
    }),
    (item) => item.location,
    items,
  );
  qp.setActive(activeIdx);
  const item = await qp.select();
  if (!item) return;
  activeIdx = items.indexOf(item);
  assert(activeIdx >= 0);
}

let statusBar: StatusBarItem;

function activate(context: ExtensionContext) {
  statusBar = window.createStatusBarItem('history', StatusBarAlignment.Right);
  statusBar.backgroundColor = new ThemeColor('statusBarItem.warningBackground');
  context.subscriptions.push(
    statusBar,
    listenAsyncWrapped(
      workspace.onDidChangeTextDocument,
      onDidChangeTextDocument,
    ),
    registerAsyncCommandWrapped('qcfg.history.wrapCmd', updateHistoryOnCommand),
    registerAsyncCommandWrapped('qcfg.history.backward', goBackward),
    registerAsyncCommandWrapped('qcfg.history.forward', goForward),
    registerAsyncCommandWrapped('qcfg.peek.openReference', peekOpenReference),
    registerAsyncCommandWrapped(
      'qcfg.peek.openReferenceToSide',
      peekOpenReferenceToSide,
    ),
    registerAsyncCommandWrapped('qcfg.history.quickPick', quickPickHistory),
  );
}

Modules.register(activate);
