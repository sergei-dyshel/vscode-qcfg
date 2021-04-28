import type {
  TextEditor,
  ViewColumn,
  ExtensionContext,
  TextDocumentChangeEvent,
} from 'vscode';
import { window, workspace, commands } from 'vscode';

import { Logger, log } from '../../library/logging';
import { getActiveTextEditor } from './utils';
import { DefaultMap } from '../../library/tsUtils';
import { listenWrapped, registerAsyncCommandWrapped } from './exception';
import { assert, assertNotNull, check } from '../../library/exception';
import { getVisibleEditor } from './windowUtils';
import { LiveLocationArray, LivePosition } from './liveLocation';
import { Modules } from './module';
import type { AsyncFunction, PromiseType } from '../../library/templateTypes';

const MAX_HISTORY_SIZE = 20;

/**
 * if after promise resolved current editor location changes,
 * add both previous and current point to history
 */
export async function updateHistory<T>(jump: Promise<T>): Promise<T> {
  const column = getActiveColumn();
  const before = LivePosition.fromActiveEditor();
  try {
    return await jump;
  } finally {
    const after = LivePosition.fromActiveEditor();
    if (column === getActiveColumn()) {
      histories.get(column).push(before);
      histories.get(column).push(after);
    }
  }
}

/**
 * Wrap async function with exception handler (both sync and async)
 */
export function wrapWithHistoryUpdate<T extends AsyncFunction>(
  func: T,
): (...funcArgs: Parameters<T>) => Promise<PromiseType<ReturnType<T>>> {
  return async (...args: Parameters<T>): Promise<PromiseType<ReturnType<T>>> =>
    updateHistory(func(...args));
}

// Private

function getActiveColumn() {
  const editor = getActiveTextEditor();
  const viewCol = editor.viewColumn;
  assertNotNull(viewCol, 'Current text editor has no view column');
  return viewCol;
}

async function goBackward() {
  const editor = getActiveTextEditor();
  await histories.get(getActiveColumn()).goBackward(editor);
}

async function goForward() {
  const editor = getActiveTextEditor();
  await histories.get(getActiveColumn()).goForward(editor);
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
  async goBackward(editor: TextEditor) {
    assert(editor.viewColumn === this.viewColumn);
    const cur = LivePosition.fromEditor(editor);
    let prev = this.backward.pop();
    check(prev !== undefined, 'No backward history');
    if (prev.equals(cur)) {
      prev = this.backward.pop();
      check(prev !== undefined, 'No backward history');
    }
    this.forward.push(cur);
    this.log.info(`Going backward to ${prev}`);
    await this.show(prev.asPosition);
  }

  private async show(pos: LivePosition) {
    await pos.show({ viewColumn: this.viewColumn });
  }

  async goForward(editor: TextEditor) {
    assert(editor.viewColumn === this.viewColumn);
    const cur = LivePosition.fromEditor(editor);
    const next = this.forward.pop();
    check(next !== undefined, 'No forward history');
    this.backward.push(cur);
    this.log.info(`Going forward to ${next}`);
    await this.show(next.asPosition);
  }

  get top(): LivePosition | undefined {
    return this.backward.top?.asPosition;
  }

  push(pos: LivePosition) {
    this.backward.push(pos);
    this.forward.clear();
    this.log.debug(`Pushed ${pos}`);
    while (this.backward.length > MAX_HISTORY_SIZE) this.backward.shift();
  }

  pushOrReplace(pos: LivePosition) {
    const { top } = this;
    if (top) {
      if (Math.abs(top.position.line - pos.position.line) > 4) {
        this.push(pos);
      } else {
        this.backward.pop();
        this.forward.clear();
        this.backward.push(pos);
        this.log.debug(`Replaced top with ${pos}`);
      }
    } else {
      this.push(pos);
    }
  }

  private readonly log: Logger;
  private readonly backward = new LiveLocationArray();
  private readonly forward = new LiveLocationArray();
}

const histories = new DefaultMap<ViewColumn, History>(
  (col) => new History(col),
);

async function updateHistoryOnCommand(cmd: string) {
  await updateHistory(commands.executeCommand(cmd));
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const editor = window.activeTextEditor;
  if (!editor) return;
  if (editor.document !== event.document) return;
  const column = editor.viewColumn;
  if (!column) return;
  const history = histories.get(column);
  const pos = LivePosition.fromActiveEditor();
  history.pushOrReplace(pos);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),

    registerAsyncCommandWrapped('qcfg.history.wrapCmd', updateHistoryOnCommand),
    registerAsyncCommandWrapped('qcfg.history.backward', goBackward),
    registerAsyncCommandWrapped('qcfg.history.forward', goForward),
  );
}

Modules.register(activate);
