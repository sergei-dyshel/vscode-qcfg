import type {
  ExtensionContext,
  StatusBarItem,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentContentChangeEvent,
  TextEditor,
  TextEditorSelectionChangeEvent,
} from 'vscode';
import {
  Location,
  Range,
  Selection,
  StatusBarAlignment,
  window,
  workspace,
} from 'vscode';
import { CheckError, checkNotNull } from '../../library/exception';
import { Logger } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { formatString } from '../../library/stringUtils';
import { DefaultMap } from '../../library/tsUtils';
import { NumRange } from './documentUtils';
import { listenWrapped, registerSyncCommandWrapped } from './exception';
import { LiveRange } from './liveLocation';
import { Modules } from './module';
import { offsetPosition } from './textUtils';
import { getActiveTextEditor } from './utils';

const HISTORY_SIZE = 20;

let status: StatusBarItem;
let lastDocHistory: DocumentHistory | undefined;

function changeToOffsetRange(change: TextDocumentContentChangeEvent) {
  return NumRange.withLength(change.rangeOffset, change.text.length);
}

class DocumentHistory {
  private readonly ranges: LiveRange[] = [];
  private index = 0;
  private savedSelection?: Selection;
  private lastEdit?: Location;

  constructor(private readonly document: TextDocument) {
    const base = nodejs.path.parse(document.fileName).base;
    this.log = new Logger({ name: 'DocumentHistory', instance: base });
  }

  get length() {
    return this.ranges.length;
  }

  get current() {
    return this.index;
  }

  get lastEditLocation() {
    return this.lastEdit;
  }

  processTextChange(change: TextDocumentContentChangeEvent) {
    this.lastEdit = new Location(this.document.uri, change.range.start);
    if (change.text.length === 0) return;
    this.log.trace(change);
    const top = this.ranges.top;
    if (top?.offsetRange.contains(changeToOffsetRange(change))) return;
    const range = new Range(
      change.range.start,
      offsetPosition(this.document, change.range.start, change.text.length),
    );
    const lrange = new LiveRange(this.document, range);
    lrange.register(() => {
      this.ranges.removeFirst(lrange);
      this.resetIndex();
    }, true /* mergeOnReplace */);
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
    this.index -= 1;
    this.log.debugStr(
      'Going backward, ({} more backward items, {} forward items)',
      this.index,
      this.ranges.length - this.index,
    );
    return this.currentSelection()!;
  }

  goForward(): Selection {
    if (this.index === this.ranges.length)
      throw new CheckError('No more forward history');
    this.index += 1;
    if (this.index === this.ranges.length) {
      const selection = this.savedSelection!;
      this.savedSelection = undefined;
      return selection;
    }
    this.log.debugStr(
      'Going forward, ({} more backward items, {} forward items)',
      this.index,
      this.ranges.length - this.index,
    );
    return this.currentSelection()!;
  }

  private readonly log: Logger;
}

const history = new DefaultMap<TextDocument, DocumentHistory>(
  (document) => new DocumentHistory(document),
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
    `edit ${docHistory.current} / ${docHistory.length}`,
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

function goLastEdit() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const docHistory = history.get(document);
  const lastEdit = docHistory.lastEditLocation;
  checkNotNull(lastEdit, 'No edits were done yet');
  editor.selection = new Selection(lastEdit.range.start, lastEdit.range.start);
  editor.revealRange(lastEdit.range);
}

function activate(context: ExtensionContext) {
  status = window.createStatusBarItem(StatusBarAlignment.Right);
  status.color = 'yellow';
  context.subscriptions.push(
    status,
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
    listenWrapped(
      window.onDidChangeTextEditorSelection,
      onDidChangeTextEditorSelection,
    ),
    listenWrapped(
      window.onDidChangeActiveTextEditor,
      onDidChangeActiveTextEditor,
    ),
    registerSyncCommandWrapped('qcfg.edit.previous', goBackward),
    registerSyncCommandWrapped('qcfg.edit.next', goForward),
    registerSyncCommandWrapped('qcfg.edit.lastLocation', goLastEdit),
  );
}

Modules.register(activate);
