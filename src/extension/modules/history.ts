import type {
  ExtensionContext,
  TextDocumentChangeEvent,
  TextEditor,
  ViewColumn,
} from 'vscode';
import { commands, window, workspace } from 'vscode';
import { assert, assertNotNull, check } from '../../library/exception';
import { log, Logger } from '../../library/logging';
import type { AsyncFunction, PromiseType } from '../../library/templateTypes';
import { DefaultMap, propagateUndefined } from '../../library/tsUtils';
import { getBesideViewColumn } from '../utils/window';
import { listenWrapped, registerAsyncCommandWrapped } from './exception';
import { LiveLocationArray, LivePosition } from './liveLocation';
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
  const before = propagateUndefined(LivePosition.fromEditor)(
    getVisibleEditor(column),
  );
  try {
    return await jump;
  } finally {
    const after = propagateUndefined(LivePosition.fromEditor)(
      getVisibleEditor(column),
    );
    if (
      !options?.onlyWhenChanged ||
      (after && before && !before.equals(after))
    ) {
      if (before) histories.get(column).push(before);
      if (after) histories.get(column).push(after);
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
    this.log.debug(`Going backward to ${prev}`);
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
    this.log.debug(`Going forward to ${next}`);
    await this.show(next.asPosition);
  }

  get top(): LivePosition | undefined {
    return this.backward.top?.asPosition;
  }

  push(pos: LivePosition) {
    if (this.backward.top?.equals(pos)) return;
    this.backward.push(pos);
    this.forward.clear();
    this.log.debug(`Pushed ${pos}`);
    while (this.backward.length > MAX_HISTORY_SIZE) this.backward.shift();
  }

  pushOrReplace(pos: LivePosition) {
    const { top, forward, backward } = this;
    if (top) {
      if (Math.abs(top.position.line - pos.position.line) > 4) {
        this.push(pos);
      } else {
        backward.pop();
        forward.clear();
        backward.push(pos);
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

async function peekOpenReference() {
  return updateHistory(commands.executeCommand('openReference'));
}

async function peekOpenReferenceToSide() {
  return updateHistory(commands.executeCommand('openReferenceToSide'), {
    column: getBesideViewColumn(),
  });
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),

    registerAsyncCommandWrapped('qcfg.history.wrapCmd', updateHistoryOnCommand),
    registerAsyncCommandWrapped('qcfg.history.backward', goBackward),
    registerAsyncCommandWrapped('qcfg.history.forward', goForward),
    registerAsyncCommandWrapped('qcfg.peek.openReference', peekOpenReference),
    registerAsyncCommandWrapped(
      'qcfg.peek.openReferenceToSide',
      peekOpenReferenceToSide,
    ),
  );
}

Modules.register(activate);
