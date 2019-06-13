'use strict';

import * as vscode from 'vscode';
import {window, workspace } from 'vscode';
import {Range, TextDocument, Position, TextEditor} from 'vscode';
import * as Parser from 'tree-sitter';
import {SyntaxNode, Tree} from 'tree-sitter';
import * as treeSitterPython from 'tree-sitter-python';
import * as treeSitterTypeScript from 'tree-sitter-typescript';
import * as treeSitterCpp from 'tree-sitter-cpp';
import {TextBuffer} from 'superstring';

import {trimInner, selectRange, offsetPosition, swapRanges} from './textUtils';
import {Context, getActiveTextEditor } from './utils';

import {log, str} from './logging';
import { registerCommandWrapped, listenWrapped } from './exception';
import { Modules } from './module';

let status: vscode.StatusBarItem;

interface LanguageConfig {
  parser: any;
}

enum Direction {
  Left,
  Right
}

namespace TreeMode {
  const NAME = 'qcfgTreeMode';

  export function set() {
    Context.set(NAME);
  }
  export function clear() {
    Context.clear(NAME);
  }
  export function is() {
    return Context.has(NAME);
  }
}

const languageConfig: {[language: string]: LanguageConfig} = {
  python: {parser: treeSitterPython},
  c: {parser: treeSitterCpp},
  cpp: {parser: treeSitterCpp},
  typescript: {parser: treeSitterTypeScript},
};

namespace Parsers {
  const parsers: {[language: string]: Parser} = {};

  export function get(language: string): Parser {
    if (language in parsers)
      return parsers[language];
    else if (language in languageConfig) {
      const parser = new Parser.default();
      parser.setLanguage(languageConfig[language].parser);
      parsers[language] = parser;
      return parser;
    }
    else {
      return log.fatal(`No parser available for language "${language}"`);
    }
  }
}

let lastSelection: Range | null;

class RangeDecorator {
  left: vscode.TextEditorDecorationType;
  right: vscode.TextEditorDecorationType;
  constructor(border :string) {
    this.left = window.createTextEditorDecorationType(
        {'border': border, borderRadius: '5px 0px 0px 5px'});
    this.right = window.createTextEditorDecorationType(
        {'border': border, borderRadius: '0px 5px 5px 0px'});
  }

  decorate(editor: TextEditor, ranges: Range[]) {
    const document = editor.document;
    function rangeFirstChar(range: Range): Range {
      return new Range(range.start, offsetPosition(document, range.start, 1));
    }
    function rangeLastChar(range: Range): Range {
      return new Range(offsetPosition(document, range.end, -1), range.end);
    }
    const firstChars = ranges.map(rangeFirstChar);
    const lastChars = ranges.map(rangeLastChar);
    editor.setDecorations(this.left, firstChars);
    editor.setDecorations(this.right, lastChars);
  }

  clear(editor: TextEditor) {
    this.decorate(editor, []);
  }
}

const siblingDecorator = new RangeDecorator('1px solid rgba(255, 255, 255, 0.50)');
const parentDecorator = new RangeDecorator('2px solid rgba(255, 255, 0, 0.25)');
const superParentDecorator = new RangeDecorator('2px solid rgba(0, 255, 0, 0.25)');

namespace Trees {
  const trees = new Map<TextDocument, Tree>();

  export async function get(document: TextDocument): Promise<Tree> {
    const parser = Parsers.get(document.languageId);
    const parserAsync = parser as any as ParserWithAsync;
    const buf = new TextBuffer(document.getText());
    // providing previous tree crashes on E8 code
    const tree = await parserAsync.parseTextBuffer(
        buf, undefined, {syncOperationCount: 1000});
    // const tree = await parserAsync.parseTextBuffer(buf);
    // const tree = parser.parse(document.getText());
    trees.set(document, tree);
    return tree;
  }

  export function removeDocument(document: TextDocument) {
    trees.delete(document);
  }
}

function onDidChangeTextEditorSelection(
    event: vscode.TextEditorSelectionChangeEvent) {
  const selections = event.selections;
  if (!lastSelection || selections.length > 1 ||
      !(selections[0].isEqual(lastSelection))) {
    clearMode();
    TreeMode.clear();
  }
}

function findContainedNode(node: SyntaxNode, range: Range, strict: boolean) {
  const nRange = nodeRange(node);
  if (range.contains(nRange) &&
      !(strict && nRange.isEqual(range))) {
    return node;
  }
  for (let i = 0; i < node.childCount; ++i) {
    const child = node.child(i) as SyntaxNode;
    const foundInChild = findContainedNode(child, range, strict);
    if (foundInChild)
      return foundInChild;
  }
}


function selectAndRememberRange(
    editor: TextEditor, range: Range, reversed?: boolean) {
  lastSelection = range;
  selectRange(editor, range, reversed);
  TreeMode.set();
}

async function shrinkSelection() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  const tree = await Trees.get(document);
  if (editor.selections.length > 1 || selection.isEmpty)
    return;
  let range: Range;
  const innerRange = trimInner(editor.document, selection);
  if (innerRange && !innerRange.isEqual(selection)) {
    range = innerRange;
  } else {
    const node = findContainedNode(tree.rootNode, selection, true /* strict */);
    if (!node)
      throw new Error("Could not shrink selection");
    updateDecorations(editor, node);
    range = nodeRange(node);
    setStatusFromNode(node);
  }
  selectAndRememberRange(editor, range);
}

// parseTextBuffer is missing in tree-sitter definitions
interface ParserWithAsync {
  parseTextBuffer(buf: TextBuffer, oldTree?: Tree, config?: {
    syncOperationCount: number
  }): Promise<Tree>;
}

function point2pos(point: Parser.Point): Position {
  return new Position(point.row, point.column);
}

function nodeRange(node: SyntaxNode): Range {

  return new Range(point2pos(node.startPosition), point2pos(node.endPosition));
}

function nodeContainsRange(
    node: SyntaxNode, range: Range): boolean {
  return nodeRange(node).contains(range);
}

function isSameNode(node1: SyntaxNode, node2: SyntaxNode) {
  return node1 && node2 && nodeRange(node1).isEqual(nodeRange(node2));
}

function nodeHasRange(node: SyntaxNode, range: Range) {
  return nodeRange(node).isEqual(range);
}

function findContainingNodeImpl(node: SyntaxNode, range: Range):
    SyntaxNode | undefined {
  if (nodeHasRange(node, range))
    return node;
  for (let i = 0; i < node.childCount; ++i) {
    const child = node.child(i) as SyntaxNode;
    const foundInChild = findContainingNodeImpl(child, range);
    if (foundInChild)
      return foundInChild;
  }
  if (nodeContainsRange(node, range))
    return node;
}

function findContainingNode(node: SyntaxNode, range: Range) : SyntaxNode {
  const contNode = findContainingNodeImpl(node, range);
  return log.assertNonNull<SyntaxNode>(
      contNode, `${str(node)} does not contain ${str(range)}`);
}

function findContainingChildren(
    root: SyntaxNode, range: Range) {
  let parent: SyntaxNode = findContainingNode(root, range);
  let firstChild: SyntaxNode | undefined;
  let lastChild: SyntaxNode | undefined;

  if (nodeRange(parent).isEqual(range)) {
    firstChild = parent;
    lastChild = parent;
    parent = log.assertNonNull<SyntaxNode>(parent.parent);
  }
  for (let i = 0; i < parent.childCount; ++i) {
    const child = log.assertNonNull<SyntaxNode>(parent.child(i));
    if (nodeRange(child).contains(range.start))
      firstChild = child;
    if (nodeRange(child).contains(range.end)) {
      lastChild = child;
      break;
    }
  }
  if (!firstChild || !lastChild)
    throw new Error('Could not identify children nodes');
  return {
    parent,
    firstChild: log.assertNonNull<SyntaxNode>(firstChild),
    lastChild: log.assertNonNull<SyntaxNode>(lastChild)
  };
}


function childrenRange(firstChild: SyntaxNode, lastChild: SyntaxNode): Range {
  const firstChildStart = point2pos(firstChild.startPosition);
  const lastChildEnd = point2pos(lastChild.endPosition);
  return new Range(firstChildStart, lastChildEnd);
}

function selectChildren(
    editor: TextEditor, firstChild: SyntaxNode, lastChild: SyntaxNode,
    reversed?: boolean) {
  selectAndRememberRange(
      editor, childrenRange(firstChild, lastChild), reversed);
  setStatusFromChildren(firstChild, lastChild);
}

async function getContext() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  if (editor.selections.length > 1)
    throw new Error('Not applicable to multiple selections');
  const tree = await Trees.get(document);
  return {editor, document, selection, tree};
}

async function selectSibling(direction: Direction, swap?: boolean) {
  if (!TreeMode.is())
    return;
  let ctx = await getContext();
  const node = findContainingNode(ctx.tree.rootNode, ctx.selection);
  let sibling: SyntaxNode | null;
  if (nodeRange(node).isEqual(ctx.selection)) {
    if (direction === Direction.Left)
      sibling = node.previousNamedSibling;
    else
      sibling = node.nextNamedSibling;
    if (!sibling)
      return;
  } else {
    sibling = node;
  }
  let siblingRange = nodeRange(sibling);
  lastSelection = siblingRange;
  if (swap && node !== sibling) {
    await swapRanges(ctx.editor, nodeRange(node), siblingRange);
    ctx = await getContext();
    sibling = findContainingNode(ctx.tree.rootNode, ctx.selection);
    siblingRange = nodeRange(sibling);
  }

  selectAndRememberRange(ctx.editor, siblingRange);
  updateDecorations(ctx.editor, sibling);
  setStatusFromNode(sibling);
}

async function extendSelection(direction: Direction) {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  const tree = await Trees.get(document);
  if (!TreeMode.is())
    return;
  const x = findContainingChildren(tree.rootNode, editor.selection);
  let parent: SyntaxNode  = x.parent;
  let firstChild: SyntaxNode | null = x.firstChild;
  let lastChild: SyntaxNode | null = x.firstChild;
  parent = parent;
  const childRange = childrenRange(firstChild, lastChild);
  if (!childRange.isEqual(selection)) {
    selectChildren(editor, firstChild, lastChild);
  } else {
    if (direction === Direction.Left) {
      if (selection.isReversed)
        firstChild = firstChild.previousNamedSibling;
      else if (firstChild !== lastChild)
        lastChild = lastChild.previousNamedSibling;
    }
    else if (direction === Direction.Right) {
      if (!selection.isReversed)
        lastChild = lastChild.nextNamedSibling;
      else if (firstChild !== lastChild)
        firstChild = firstChild.nextNamedSibling;
    }
    if (firstChild && lastChild)
      selectChildren(editor, firstChild, lastChild, selection.isReversed);
  }
  updateDecorations(editor, log.assertNonNull<SyntaxNode>(firstChild));
}

function updateDecorations(editor: TextEditor, node: SyntaxNode) {
  const parent = getProperParent(node);
  if (!parent)
    return;
  const superParent = getSuperParent(node);
  // if (isSameNode(superParent, parent))
  //   superParentDecorator.clear(editor);
  // else
  if (superParent)
    superParentDecorator.decorate(editor, [nodeRange(superParent)]);
  else
    superParentDecorator.clear(editor);
  if (node.parent)
    siblingDecorator.decorate(editor, node.parent.namedChildren.map(nodeRange));
  else
    siblingDecorator.clear(editor);
  parentDecorator.decorate(editor, [nodeRange(parent)]);
}

function getSuperParent(node: SyntaxNode) {
  const COMPOUND_NODE_TYPES: string[] = [
    'statement_block',
    'arguments',
    'formal_paremeters',
    'array',
    'program',
    'module',
    'preproc_if',
    // 'function_definition', // only in python
    'compound_statement',
    'field_declaration_list',
    'declaration_list',
    'translation_unit',
  ];
  let sParent: SyntaxNode | null;
  sParent = getProperParent(node);
  while (sParent) {
    const parent = getProperParent(sParent);
    if (!parent)
      return sParent;
    if (COMPOUND_NODE_TYPES.includes(parent.type))
      return sParent;
    sParent = parent;
  }
}

function getProperParent(node: SyntaxNode) {
  let parent = node.parent;
  while (parent && isSameNode(node, parent)) {
    node = parent;
    parent = node.parent;
  }
  return parent;
}

async function expandSelection(superParent: boolean) {
  const ctx = await getContext();
  let node = findContainingNode(ctx.tree.rootNode, ctx.selection);
  if (nodeHasRange(node, ctx.selection) && TreeMode.is()) {
    const parent = superParent ? getSuperParent(node) : getProperParent(node);
    if (!parent)
      throw new Error('No parent');
    node = parent;
  }
  updateDecorations(ctx.editor, node);
  setStatusFromNode(node);
  selectAndRememberRange(ctx.editor, nodeRange(node));
}

function setStatusFromNode(node: SyntaxNode) {
  const parent = getProperParent(node);
  const parentType = parent ? parent.type : '';
  status.text = `${parentType} $(arrow-right) ${node.type}`;
  status.show();
}

function setStatusFromChildren(firstChild: SyntaxNode, lastChild: SyntaxNode) {
  let childStr: string;
  if (firstChild.type === lastChild.type)
    childStr = `${firstChild.type}...`;
  else
    childStr = '...';
  const parentType = firstChild.parent ? firstChild.parent.type : '';
  status.text = `${parentType} $(arrow-right) ${childStr}`;
  status.show();
}

function clearMode() {
  for (const editor of window.visibleTextEditors) {
    superParentDecorator.decorate(editor, []);
    parentDecorator.decorate(editor, []);
    siblingDecorator.decorate(editor, []);
  }
   lastSelection = null;
   TreeMode.clear();
   status.hide();
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(workspace.onDidCloseTextDocument, Trees.removeDocument),
      listenWrapped(workspace.onDidChangeTextDocument, clearMode),
      listenWrapped(
          window.onDidChangeTextEditorSelection,
          onDidChangeTextEditorSelection),
      listenWrapped(window.onDidChangeActiveTextEditor, clearMode),
      registerCommandWrapped(
          'qcfg.selection.expand', () => expandSelection(false /* parent */)),
      registerCommandWrapped(
          'qcfg.selection.selectSuperParent',
          () => expandSelection(true /* superParent */)),
      registerCommandWrapped('qcfg.selection.shrink', shrinkSelection),
      registerCommandWrapped(
          'qcfg.selection.left', () => selectSibling(Direction.Left)),
      registerCommandWrapped(
          'qcfg.selection.right', () => selectSibling(Direction.Right)),
      registerCommandWrapped(
          'qcfg.selection.extendLeft', () => extendSelection(Direction.Left)),
      registerCommandWrapped(
          'qcfg.selection.extendRight', () => extendSelection(Direction.Right)),
      registerCommandWrapped(
          'qcfg.selection.swapLeft',
          () => selectSibling(Direction.Left, true /* swap */)),
      registerCommandWrapped(
          'qcfg.selection.swapRight',
          () => selectSibling(Direction.Right, true /* swap */)));
  status = window.createStatusBarItem();
}

Modules.register(activate);