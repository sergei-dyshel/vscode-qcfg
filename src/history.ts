'use strict';

import { Dictionary } from 'typescript-collections';
import * as vscode from 'vscode';
import { Position, TextDocument, TextEditor, ViewColumn, window, workspace } from 'vscode';
import { Logger, log, str } from './logging';
import { setTimeoutPromise } from './nodeUtils';
import { getActiveTextEditor } from './utils';
import { filterNonNull } from './tsUtils';
import { registerCommandWrapped, listenWrapped } from './exception';

let extContext: vscode.ExtensionContext;

enum TemporaryMode {
  NORMAL,
  FORCE_TEMPORARY,
  FORCE_NON_TEMPORARY
}

let temporaryMode = TemporaryMode.NORMAL;

export function activate(context: vscode.ExtensionContext) {
  extContext = context;
  setupDicts();
  loadHistory();
  setInterval(saveHistory, 30000);
  context.subscriptions.push(
      listenWrapped(
          window.onDidChangeVisibleTextEditors, onDidChangeVisibleTextEditors),
      listenWrapped(
          window.onDidChangeTextEditorSelection,
          onDidChangeTextEditorSelection),
      listenWrapped(
          window.onDidChangeTextEditorViewColumn,
          onDidChangeTextEditorViewColumn),
      listenWrapped(
          window.onDidChangeActiveTextEditor, onDidChangeActiveTextEditor),
      listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
      registerCommandWrapped('qcfg.history.backward', goBackward),
      registerCommandWrapped('qcfg.history.forward', goForward));
}

export function deactivate() {
  saveHistory();
}

export function forceTemporary() {
  log.info('Forcing temporary mode');
  temporaryMode = TemporaryMode.FORCE_TEMPORARY;
}

export function forceNonTemporary() {
  log.info('Forcing non-temporary mode');
  temporaryMode = TemporaryMode.FORCE_NON_TEMPORARY;
}

export function resetTemporary() {
  log.info('Unforcing temporary mode');
  temporaryMode = TemporaryMode.NORMAL;
}

// Private

function resetHistory() {
  histories = window.visibleTextEditors.filter(editor => editor.viewColumn)
                  .map(editor => new History(editor.viewColumn!));
  numViewColumns = histories.length;
}

function setupDicts() {
  resetHistory();
  for (const document of workspace.textDocuments)
    allDocuments.setValue(document.fileName, document);
}

function onDidChangeActiveTextEditor(editor?: TextEditor) {
  if (!editor || !editor.viewColumn)
    return;
  getHistory(editor.viewColumn).updateCurrent(true );
}

function onDidChangeTextEditorViewColumn(_: vscode.TextEditorViewColumnChangeEvent)
{
  // log.info(`TEMP: onDidChangeTextEditorViewColumn ${str(event.textEditor)}`);
}

async function onDidChangeVisibleTextEditors(_: TextEditor[])
{
  await setTimeoutPromise(3000);
  // const visibleTextEditors = window.visibleTextEditors;
  // log.info(`TEMP: onDidChangeVisibleTextEditors ${str(visibleTextEditors)}`);
  const newNumViewColumns =
      window.visibleTextEditors.filter(editor => editor.viewColumn).length;
  if (newNumViewColumns === numViewColumns)
    return;
  if (newNumViewColumns < numViewColumns) {
    log.info(`${numViewColumns - newNumViewColumns} view columns removed`);
    while (histories.length > newNumViewColumns)
      histories.pop();
  } else if (newNumViewColumns > numViewColumns) {
    log.info(`${newNumViewColumns - numViewColumns} view columns added`);
    while (histories.length < newNumViewColumns)
      histories.push(new History(histories.length as ViewColumn));
  }
  numViewColumns = newNumViewColumns;
}

function onDidChangeTextEditorSelection(
    event: vscode.TextEditorSelectionChangeEvent) {
  if (event.selections.length > 1)
    return;

  const editor = event.textEditor;
  const viewCol = editor.viewColumn;
  if (!viewCol)
    return;
  // log.debug(`TEMP: onDidChangeTextEditorSelection ${str(editor)} ${event.kind} ${
  //     str(event.selections)}`);
  const temporary =
      (event.kind !== vscode.TextEditorSelectionChangeKind.Command);
  // TODO: also check quickpick open
  getHistory(viewCol).updateCurrent(temporary);
}

// TODO: use functions from documentUtils
function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent)
{
  if (event.document.uri.scheme !== 'file')
    return;
  const eventCopy = {
    ...event,
    contentChanges: [...event.contentChanges]
  };
  eventCopy.contentChanges.sort((a, b) => (a.rangeOffset - b.rangeOffset));
  for (const history of histories)
    history.fixAfterChange(eventCopy);
  if (eventCopy.contentChanges.length > 1)
    return;
  const editor = window.activeTextEditor;
  if (!editor)
    return;
  if (eventCopy.document !== editor.document)
    return;
  /// #if DEBUG
  log.trace(`Edited ${str(editor.document)}${eventCopy.contentChanges[0].range}`);
  /// #endif
}

function getHistory(viewColumn: ViewColumn): History {
  const col = viewColumn as number;
  log.assert(histories.length >= col);
  return histories[col - 1];
}

function goBackward() {
  const viewCol = getActiveTextEditor().viewColumn;
  const history = getHistory(
      log.assertNonNull(viewCol, 'Current text editor has no view column'));
  history.goBackward();
}

function goForward() {
  const viewCol = getActiveTextEditor().viewColumn;
  const history = getHistory(
      log.assertNonNull(viewCol, 'Current text editor has no view column'));
  history.goForward();
}

function saveHistory()
{
  const savedHistories: History.Saved[] =
      histories.map(history => history.getSaved());
  log.info('Saving histories: ', histories.map(hist => hist.size()));
  return extContext.workspaceState.update('history', savedHistories);
}

function loadHistory() {
  const savedHistories =
      extContext.workspaceState.get<History.Saved[]>('history', []);
  histories.forEach((history, idx) => {
    if (savedHistories.length > idx)
      history.load(savedHistories[idx]);
  });
  log.info('Loaded histories: ', histories.map(hist => hist.size()));
}

namespace Point {
  export interface Saved {
    fileName: string;
    offset: number;
  }
}

class Point {
  constructor(
      private document: TextDocument, private offset: number,
      private position?: Position, private timestamp?: number) {}

  static fromEditor(editor: TextEditor): Point {
    const document = editor.document;
    const pos = editor.selection.active.with();
    return new Point(document, document.offsetAt(pos), pos, Date.now());
  }

  static fromSaved(saved: Point.Saved): Point | undefined {
    const document = findDocument(saved.fileName);
    if (!document)
      return;
    return new Point(document, saved.offset, document.positionAt(saved.offset));
  }

  equals(other: Point): boolean {
    return this.document.fileName === other.document.fileName &&
        this.offset === other.offset;
  }

  farEnough(other: Point): boolean {
    if (!this.sameFile(other))
      return true;
    this.tryFixPosition();
    other.tryFixPosition();
    if (!this.position || !other.position)
      return true;
    if (this.position.line !== other.position.line)
      return true;
    return false;
  }

  distantInTime(other: Point): boolean {
    if (!this.timestamp || !other.timestamp)
      return true;
    return Math.abs(this.timestamp - other.timestamp) > 1000;
  }

  sameFile(other: Point): boolean {
    return this.document.fileName === other.document.fileName;
  }

  toString(): string {
    if (this.position)
      return `<${this.document.fileName}:${this.position.line + 1}:${
          this.position.character + 1}>`;
    else
      return `<${this.document.fileName}(${this.offset})>`;
  }

  async goto() {
    if (this.document.isClosed)
      this.document = await workspace.openTextDocument(this.document.fileName);
    this.position = this.document.positionAt(this.offset);
    await window.showTextDocument(
        this.document,
        {selection: new vscode.Range(this.position, this.position)});
  }

  fixAfterChange(event: vscode.TextDocumentChangeEvent) {
    if (event.document.fileName !== this.document.fileName)
      return;
    let delta = 0;
    for (const change of event.contentChanges) {
      if (change.rangeOffset + change.rangeLength <= this.offset)
        delta += change.text.length - change.rangeLength;
      else
        break;
    }
    this.offset += delta;
    this.position = undefined;
  }

  getSaved(): Point.Saved {
    return {fileName: this.document.fileName, offset: this.offset};
  }

  private tryFixPosition(): boolean {
    if (this.position)
      return true;
    if (this.document.isDirty) {
      const newDoc = findDocument(this.document.fileName);
      if (newDoc)
        this.document = newDoc;
      else
        return false;
    }
    this.position = this.document.positionAt(this.offset);
    return true;
  }
}

function findDocument(fileName: string): TextDocument|undefined {
  for (const doc of workspace.textDocuments)
    if (doc.fileName === fileName)
      return doc;
}

namespace History {
  export type Saved = Point.Saved[];
}

class History {
  constructor(private viewColumn: ViewColumn) {
    const editor = log.assertNonNull(getVisibleEditor(viewColumn));
    this.current = Point.fromEditor(editor);
    this.log = new Logger({
      name: 'viewColumnHistory',
      parent: log,
      instance: viewColumn.toString()
    });
  }

  goBackward() {
    log.assert(temporaryMode === TemporaryMode.NORMAL);
    this.forward.push(this.current);
    let back: Point | undefined;
    do {
      back = this.backward.pop();
    } while (back && !this.current.farEnough(back));
    this.log.assert(back, `No backward history`);
    this.current = back!;
    this.current.goto();
    this.log.info(`Went backward to ${this.current}`);
  }

  goForward() {
    log.assert(temporaryMode === TemporaryMode.NORMAL);
    this.log.assert(this.forward.length > 0, `No forward history`);
    this.backward.push(this.current);
    this.current = this.forward.pop()!;
    this.current.goto();
    this.log.info(`Moved forward to ${this.current}`);
  }

  updateCurrent(temporary: boolean) {
    if (temporaryMode === TemporaryMode.FORCE_TEMPORARY)
      temporary = true;
    else if (temporaryMode === TemporaryMode.FORCE_NON_TEMPORARY)
      temporary = false;
    const editor = log.assertNonNull(getVisibleEditor(this.viewColumn));
    const point = Point.fromEditor(editor);
    if (point.equals(this.current))
      return;
    if (temporary) {
      if (this.currentIsTemporary && !point.sameFile(this.current) &&
          point.distantInTime(this.current))
        this.pushCurrentIfNeeded();
      this.current = point;
      this.currentIsTemporary = true;
      this.log.debug(`Updated current (temporary) ${this.current}`);
      return;
    }
    if (this.currentIsTemporary && point.distantInTime(this.current))
      this.pushCurrentIfNeeded();
    this.current = point;
    this.pushCurrentIfNeeded();
    this.currentIsTemporary = false;
  }

  top(): Point {
    return log.assertNonNull(this.backward[this.backward.length - 1]);
  }

  private pushCurrentIfNeeded() {
    this.backward =
        this.backward.filter(point => point.farEnough(this.current));
    this.backward.push(this.current);
    this.log.info(`Pushed ${this.current}`);
  }

  fixAfterChange(event: vscode.TextDocumentChangeEvent) {
    this.backward.map(point => point.fixAfterChange(event));
    this.forward.map(point => point.fixAfterChange(event));
    this.current.fixAfterChange(event);
  }

  size() {
    return this.backward.length;
  }

  getSaved(): History.Saved {
    return this.backward.map(point => point.getSaved());
  }

  load(savedHistory: History.Saved) {
    this.backward = filterNonNull(
        savedHistory.map(savedPoint => Point.fromSaved(savedPoint)));
  }

  private log: Logger;
  private backward: Point[] = [];
  private forward: Point[] = [];

  private current: Point;
  private currentIsTemporary = false;
}

function getVisibleEditor(viewColumn: ViewColumn): TextEditor|undefined {
  for (const editor of window.visibleTextEditors)
    if (editor.viewColumn === viewColumn)
      return editor;
}

let numViewColumns = 0;
let histories: History[] = [];
const allDocuments = new Dictionary<string, TextDocument>();