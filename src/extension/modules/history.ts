import type { TextEditor, ViewColumn, ExtensionContext } from 'vscode';

import { Logger, log } from '../../library/logging';
import { getActiveTextEditor } from './utils';
import { DefaultMap } from '../../library/tsUtils';
import { registerAsyncCommandWrapped } from './exception';
import { assert, assertNotNull, check } from '../../library/exception';
import { getVisibleEditor } from './windowUtils';
import { LiveLocationArray, LivePosition } from './liveLocation';
import { Modules } from './module';

const MAX_HISTORY_SIZE = 20;

export async function updateHistory(jump: Promise<unknown>) {
  const column = getActiveColumn();
  const before = LivePosition.fromActiveEditor();
  await jump;
  const after = LivePosition.fromActiveEditor();
  if (column !== getActiveColumn()) {
    return;
  }
  histories.get(column).push(before);
  histories.get(column).push(after);
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

  push(pos: LivePosition) {
    this.backward.push(pos);
    this.forward.clear();
    this.log.info(`Pushed ${pos}`);
    while (this.backward.length > MAX_HISTORY_SIZE) this.backward.shift();
  }

  private readonly log: Logger;
  private readonly backward = new LiveLocationArray();
  private readonly forward = new LiveLocationArray();
}

const histories = new DefaultMap<ViewColumn, History>(
  (col) => new History(col),
);

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.history.backward', goBackward),
    registerAsyncCommandWrapped('qcfg.history.forward', goForward),
  );
}

Modules.register(activate);
