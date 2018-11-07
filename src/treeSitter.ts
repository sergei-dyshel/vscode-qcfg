'use strict';

import * as vscode from 'vscode';
import {window, workspace, commands} from 'vscode';
import {Range, TextDocument, Position, TextEditor} from 'vscode';
import * as Parser from 'tree-sitter';
import {SyntaxNode, Tree} from 'tree-sitter';
import * as treeSitterPython from 'tree-sitter-python';
import * as treeSitterTypeScript from 'tree-sitter-typescript';
import * as treeSitterCpp from 'tree-sitter-cpp';
import {TextBuffer} from 'superstring';

import {trimInner, selectRange} from './textUtils';

import {Logger, str} from './logging';

const log = new Logger('tree');

let status: vscode.StatusBarItem;

interface LanguageConfig {
  parser: any;
}

const languageConfig: {[language: string]: LanguageConfig} = {
  python: {parser: treeSitterPython},
  c: {parser: treeSitterCpp},
  cpp: {parser: treeSitterCpp},
  typescript: {parser: treeSitterTypeScript}
};

namespace Parsers {
  const parsers: {[language: string]: Parser} = {};

  export function get(language: string): Parser {
    if (language in parsers)
      return parsers[language];
    else if (language in languageConfig) {
      const parser = new Parser();
      parser.setLanguage(languageConfig[language].parser);
      parsers[language] = parser;
      return parser;
    }
    else {
      log.fatal(`No parser available for language "${language}"`);
    }
  }
}

let history: Range[] = [];

namespace Trees {
  const trees = new Map<TextDocument, Tree>();

  export async function get(document: TextDocument): Promise<Tree> {
    const parser = Parsers.get(document.languageId);
    const parserAsync = parser as any as ParserWithAsync;
    const buf = new TextBuffer(document.getText());
    const state = trees.get(document);
    const tree = await parserAsync.parseTextBuffer(
        buf, trees.get(document), {syncOperationCount: 1000});
    // const tree = await parserAsync.parseTextBuffer(buf);
    // const tree = parser.parse(document.getText());
    trees.set(document, tree);
    return tree;
  }

  export function removeDocument(document: TextDocument) {
    trees.delete(document);
  }
}

function onSelect(selections: Range[]) {
  if (history.length === 0)
    return;
  if (selections.length > 1 || !(selections[0].isEqual(history.slice(-1)[0])))
    history = [];
}

function shrinkSelection() {
  if (!history.length)
    log.fatal('Could not shrink selection');
  history.pop();
  if (!history.length)
    log.fatal('No previous selection');
  const last = history.slice(-1)[0];
  selectRange(window.activeTextEditor, last);
}

// parseTextBuffer is missing in tree-sitter definitions
interface ParserWithAsync {
  parseTextBuffer(buf: TextBuffer, oldTree?: Tree, config?: {
    syncOperationCount: number
  }): Promise<Tree>;
}

function nodeRange(node: SyntaxNode): Range {
  function point2pos(point: Parser.Point): Position {
    return new Position(point.row, point.column);
  }

  return new Range(point2pos(node.startPosition), point2pos(node.endPosition));
}

function nodeContainsRange(
    node: SyntaxNode, range: Range): boolean {
  return nodeRange(node).contains(range);
}

function findContainingNode(
    node: SyntaxNode, range: Range, strict?: boolean): SyntaxNode {
  for (let i = 0; i < node.childCount; ++i) {
    const child = node.child(i);
    const foundInChild = findContainingNode(child, range, strict);
    if (foundInChild)
      return foundInChild;
  }
  if (nodeContainsRange(node, range) &&
      !(strict && nodeRange(node).isEqual(range)))
    return node;
}

async function expandSelection() {
  const editor = window.activeTextEditor;
  const doc = editor.document;
  const tree = await Trees.get(doc);
  const selection = editor.selection;
  const node = findContainingNode(tree.rootNode, selection, true);
  if (!node)
    throw new Error("Could not expand selection");
  // status.text = node.type;
  // status.show();
  let range = nodeRange(node);
  const innerRange = trimInner(doc, range);
  if (!innerRange.isEqual(selection))
    range = innerRange;
  history.push(range);
  selectRange(editor, range);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      workspace.onDidCloseTextDocument(Trees.removeDocument),
      workspace.onDidChangeTextDocument(
          (event) => { history = []; }),
      window.onDidChangeTextEditorSelection(
          (event) => onSelect(event.selections)),
      window.onDidChangeActiveTextEditor((event) => { history = []; }),
      commands.registerCommand('qcfg.selection.expand', expandSelection),
      commands.registerCommand('qcfg.selection.shrink', shrinkSelection));

  status = window.createStatusBarItem();
}