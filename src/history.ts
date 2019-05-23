'use strict';

import { Dictionary } from 'typescript-collections';
import * as vscode from 'vscode';
import { Position, TextDocument, TextEditor, ViewColumn, window, workspace, commands } from 'vscode';
import { Logger, str } from './logging';
import { getActiveTextEditor } from './utils';
import { setImmediatePromise } from './nodeUtils';

const log = Logger.create('history');

export function activate(context: vscode.ExtensionContext) {
    setupDicts();

    context.subscriptions.push(
        window.onDidChangeVisibleTextEditors(onDidChangeVisibleTextEditors),
        window.onDidChangeTextEditorSelection(onDidChangeTextEditorSelection),
        window.onDidChangeTextEditorViewColumn(onDidChangeTextEditorViewColumn),
        workspace.onDidChangeTextDocument(onDidChangeTextDocument),
        commands.registerCommand('qcfg.history.backward', goBackward)
    );
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

function onDidChangeTextEditorViewColumn(_: vscode.TextEditorViewColumnChangeEvent)
{
  // log.info(`TEMP: onDidChangeTextEditorViewColumn ${str(event.textEditor)}`);
}

async function onDidChangeVisibleTextEditors(_: TextEditor[])
{
  await setImmediatePromise();
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
  log.debug(`TEMP: onDidChangeTextEditorSelection ${editor} ${event.kind} ${
      event.selections}`);
  const temporary =
      (event.kind !== vscode.TextEditorSelectionChangeKind.Command);
  // TODO: also check quickpick open
  getHistory(viewCol).updateCurrent(temporary);
}

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent)
{
  event.contentChanges.sort((a, b) => (a.rangeOffset - b.rangeOffset));
  for (const history of histories)
    history.fixAfterChange(event);
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

class Point {
  constructor(editor: TextEditor) {
    this.position = editor.selection.active.with();
    this.document = editor.document;
    this.offset = this.document.offsetAt(this.position);
  }
  private document: TextDocument;
  private position?: Position;
  private offset: number;

  equals(other: Point): boolean {
    return this.document.fileName === other.document.fileName &&
        this.offset === other.offset;
  }

  farEnough(other: Point): boolean {
    if (other.document.fileName !== this.document.fileName)
      return true;
    if (!this.position || !other.position)
      return true;
    if (this.position.line !== other.position.line)
      return true;
    return false;
  }

  toString(): string {
    return `${str(this.document)}${str(this.position)}`;
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
}

class History {
  constructor(private viewColumn: ViewColumn) {
    const editor = log.assertNonNull(getVisibleEditor(viewColumn));
    this.current = new Point(editor);
    this.log = Logger.create(
        'History',
        {parent: log, instance: `viewColumn=${viewColumn.toString()}`});
  }

  goBackward() {
    this.log.assert(this.backward.length > 0, `No backward history`);
    this.forward.push(this.current);
    this.current = this.backward.pop()!;
    this.current.goto();
    this.log.info(`Moved backward to ${this.current}`);
  }

  updateCurrent(temporary: boolean) {
    const editor = log.assertNonNull(getVisibleEditor(this.viewColumn));
    const point = new Point(editor);
    if (point.equals(this.current))
      return;
    if (temporary) {
      this.current = point;
      this.log.debug(`Updated current (temporary) ${this.current}`);
      return;
    }
    if (this.currentIsTemporary)
      this.pushCurrentIfNeeded();
    this.current = point;
    this.pushCurrentIfNeeded();
  }

  private pushCurrentIfNeeded() {
    if (this.backward.length === 0 ||
        this.backward[this.backward.length - 1].farEnough(this.current)) {
      this.backward.push(this.current);
      this.log.info(`Pushed ${this.current}`);
    }
  }

  fixAfterChange(event: vscode.TextDocumentChangeEvent) {
    this.backward.map(point => point.fixAfterChange(event));
    this.forward.map(point => point.fixAfterChange(event));
    this.current.fixAfterChange(event);
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