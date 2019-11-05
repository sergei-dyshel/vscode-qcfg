'use strict';

import {
  ExtensionContext,
  Range,
  Selection,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentContentChangeEvent,
  workspace,
  window,
  TextEditorSelectionChangeEvent,
  StatusBarItem,
  TextEditor,
  StatusBarAlignment
} from 'vscode';
import {
  listenWrapped,
  CheckError,
  registerSyncCommandWrapped
} from './exception';
import { Logger } from './logging';
import { DefaultMap } from './tsUtils';
import { getActiveTextEditor } from './utils';
import { Modules } from './module';
import * as nodejs from './nodejs';
import { LiveRange } from './liveLocation';
import { offsetPosition } from './textUtils';
import { NumRange } from './documentUtils';
import { formatString } from './stringUtils';

const HISTORY_SIZE = 20;

let status: StatusBarItem;
let lastDocHistory: DocumentHistory | undefined;

function changeToOffsetRange(change: TextDocumentContentChangeEvent) {
  return NumRange.withLength(change.rangeOffset, change.text.length);
}

class DocumentHistory {
  private ranges: LiveRange[] = [];
  private index = 0;
  private savedSelection?: Selection;

  constructor(private document: TextDocument) {
    const base = nodejs.path.parse(document.fileName).base;
    this.log = new Logger({ instance: base, level: 'trace' });
  }

  get length() {
    return this.ranges.length;
  }
  get current() {
    return this.index;
  }

  processTextChange(change: TextDocumentContentChangeEvent) {
    if (change.text.length === 0) return;
    this.log.trace(change);
    const top = this.ranges.top;
    if (top && top.offsetRange.contains(changeToOffsetRange(change))) return;
    const range = new Range(
      change.range.start,
      offsetPosition(this.document, change.range.start, change.text.length)
    );
    const lrange = new LiveRange(this.document, range, {
      mergeOnReplace: true,
      onInvalidated: () => {
        this.ranges.removeFirst(lrange);
        this.resetIndex();
      }
    });
    lrange.register();
    this.ranges.push(lrange);
    if (this.ranges.length > HISTORY_SIZE) this.ranges.shift();
    this.resetIndex();
    this.log.trace('Pushing', lrange);
  }

  currentSelection(): Selection | undefined {
    if (this.index >= this.ranges.length) return undefined;
    return this.ranges[this.index].range.asSelection();
  }

  resetIndex() {
    this.index = this.ranges.length;
    this.savedSelection = undefined;
  }

  goBackward(selection: Selection): Selection {
    if (this.index === 0) throw new CheckError('No backward  history');
    if (this.index === this.ranges.length) this.savedSelection = selection;
    --this.index;
    this.log.debugStr(
      'Going backward, ({} more backward items, {} forward items)',
      this.index,
      this.ranges.length - this.index
    );
    return this.currentSelection()!;
  }

  goForward(): Selection {
    if (this.index === this.ranges.length)
      throw new CheckError('No more forward history');
    ++this.index;
    if (this.index === this.ranges.length) {
      const selection = this.savedSelection!;
      this.savedSelection = undefined;
      return selection;
    }
    this.log.debugStr(
      'Going forward, ({} more backward items, {} forward items)',
      this.index,
      this.ranges.length - this.index
    );
    return this.currentSelection()!;
  }

  private log: Logger;
}

const history = new DefaultMap<TextDocument, DocumentHistory>(
  document => new DocumentHistory(document)
);

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const document = event.document;
  const changes = event.contentChanges;
  if (document.fileName.startsWith('extension-output')) return;
  if (changes.isEmpty || changes.length > 1) return;
  const docHistory = history.get(document);
  docHistory.processTextChange(changes[0]);
  endHistoryNavigation();
}

function onDidChangeTextEditorSelection(event: TextEditorSelectionChangeEvent) {
  const document = event.textEditor.document;
  if (document.fileName.startsWith('extension-output')) return;
  if (!history.has(document)) return;
  const docHistory = history.get(document);
  const historySelection = docHistory.currentSelection();
  if (
    historySelection &&
    event.selections.length === 1 &&
    event.selections[0].isEqual(historySelection)
  )
    return;
  endHistoryNavigation();
}

function endHistoryNavigation() {
  if (lastDocHistory) lastDocHistory.resetIndex();
  lastDocHistory = undefined;
  status.hide();
}

function startHistoryNavigation(docHistory: DocumentHistory) {
  lastDocHistory = docHistory;
  status.text = formatString(
    `edit ${docHistory.current} / ${docHistory.length}`
  );
  status.show();
}

function onDidChangeActiveTextEditor(_: TextEditor | undefined) {
  endHistoryNavigation();
}

function goBackward() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const docHistory = history.get(document);
  editor.selection = docHistory.goBackward(editor.selection);
  editor.revealRange(editor.selection);
  startHistoryNavigation(docHistory);
}

function goForward() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const docHistory = history.get(document);
  editor.selection = docHistory.goForward();
  editor.revealRange(editor.selection);
  startHistoryNavigation(docHistory);
}

function activate(context: ExtensionContext) {
  status = window.createStatusBarItem(StatusBarAlignment.Right);
  status.color = 'yellow';
  context.subscriptions.push(
    status,
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
    listenWrapped(
      window.onDidChangeTextEditorSelection,
      onDidChangeTextEditorSelection
    ),
    listenWrapped(
      window.onDidChangeActiveTextEditor,
      onDidChangeActiveTextEditor
    ),
    registerSyncCommandWrapped('qcfg.edit.previous', goBackward),
    registerSyncCommandWrapped('qcfg.edit.next', goForward)
  );
}

Modules.register(activate);
