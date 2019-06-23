'use strict';

import { CancellationToken, commands, ExtensionContext, languages, Position, Range, Selection, SelectionRange, TextDocument, TextDocumentChangeEvent, TextEditor, workspace } from 'vscode';
import { handleErrorsAsync, listenWrapped, registerCommandWrapped } from './exception';
import { Logger, str } from './logging';
import { Modules } from './module';
import { SyntaxNode, SyntaxTree, SyntaxTrees } from './syntaxTree';
import { selectRange, swapRanges, trimInner, trimWhitespace } from './textUtils';
import { getActiveTextEditor } from './utils';

const log = new Logger({level: 'trace'});

enum Direction {
  Left,
  Right
}

function selectAndRememberRange(
    editor: TextEditor, range: Range, reversed?: boolean) {
  selectRange(editor, range, reversed);
}

function isSameNode(node1: SyntaxNode, node2: SyntaxNode) {
  return node1 && node2 && node1.range.isEqual(node2.range);
}

function findContainingNodeImpl(node: SyntaxNode, range: Range):
    SyntaxNode | undefined {
  if (node.range.isEqual(range))
    return node;
  for (let i = 0; i < node.childCount; ++i) {
    const child = node.child(i) as SyntaxNode;
    const foundInChild = findContainingNodeImpl(child, range);
    if (foundInChild)
      return foundInChild;
  }
  if (node.range.contains(range))
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

  if (parent.range.isEqual(range))
    parent = log.assertNonNull(parent.parent);
  while (!isListNode(parent)) {
    parent = log.assertNonNull(parent.parent);
  }
  for (let i = 0; i < parent.namedChildCount; ++i) {
    const child = parent.namedChild(i)!;
    if (child.range.contains(range.start))
      firstChild = child;
    if (child.range.contains(range.end)) {
      lastChild = child;
      break;
    }
  }
  if (!firstChild || !lastChild)
    throw new Error('Could not identify children nodes');
  return {parent, firstChild, lastChild};
}


function childrenRange(firstChild: SyntaxNode, lastChild: SyntaxNode): Range {
  return new Range(firstChild.start, lastChild.end);
}

function selectChildren(
    editor: TextEditor, firstChild: SyntaxNode, lastChild: SyntaxNode,
    reversed?: boolean) {
  selectAndRememberRange(
      editor, childrenRange(firstChild, lastChild), reversed);
}

async function getContext() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  if (editor.selections.length > 1)
    throw new Error('Not applicable to multiple selections');
  const tree = await SyntaxTrees.get(document);
  return {editor, document, selection, tree};
}

async function selectSibling(direction: Direction, swap?: boolean) {
  let ctx = await getContext();
  const {parent, firstChild, lastChild} =
      findContainingChildren(ctx.tree.rootNode, ctx.selection);
  let node = (firstChild !== lastChild) ?
      (direction === Direction.Left ? firstChild : lastChild) :
      firstChild;
  const sibling = node.range.isEqual(ctx.selection) ?
      (direction === Direction.Left ? parent.previousNamedSibling :
                                      parent.nextNamedSibling) :
      node;
  if (!sibling)
        return;
  if (sibling === node) {
    selectChildren(ctx.editor, node, node, direction === Direction.Left);
    return;
  }
  let siblingRange = node.range;
  if (swap && parent !== node) {
    await swapRanges(ctx.editor, parent.range, siblingRange);
    ctx = await getContext();
    node = findContainingNode(ctx.tree.rootNode, ctx.selection);
    siblingRange = node.range;
  }

  selectAndRememberRange(ctx.editor, siblingRange);
}

async function extendSelection(direction: Direction) {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  const tree = await SyntaxTrees.get(document);
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
}

const LIST_NODE_TYPES: string[] = [
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

function isListNode(node: SyntaxNode) {
  return LIST_NODE_TYPES.includes(node.type);
}

/* REFACTOR: unexport */
export function getSuperParent(node: SyntaxNode) {
  let sParent: SyntaxNode | null;
  sParent = getProperParent(node);
  while (sParent) {
    const parent = getProperParent(sParent);
    if (!parent)
      return sParent;
    if (isListNode(node))
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

class ExpandMode {
  async init() {
    const document = this.editor.document;
    const position = this.currentRange.end;
    const wordRange = document.getWordRangeAtPosition(position);
    const result = await commands.executeCommand(
        'vscode.executeSelectionRangeProvider', document.uri, [position]);
    const allSelRanges = result as SelectionRange[];
    let selRange: SelectionRange|undefined = allSelRanges[0];
    while (selRange) {
      const range = selRange.range;
      if (range.strictlyContains(this.currentRange) &&
          (!wordRange || range.contains(wordRange)))
        this.expandRanges.push(range);
      selRange = selRange.parent;
    }
    log.trace('Selection range provider returned ranges', this.expandRanges);
    this.expandRanges = this.expandRanges.filter(
        range => trimWhitespace(document, range).isEqual(range));
    log.trace('expandRanges after filtering', this.expandRanges);
  }

  expand() {
    const document = this.editor.document;
    if (this.expandRanges.isEmpty)
      return;
    while (!this.expandRanges.isEmpty) {
      this.shrinkRanges.push(this.currentRange);
      this.currentRange = this.expandRanges.shift()!;
      this.setSelection();
      if (this.expandRanges.isEmpty)
        break;
      const prev = this.shrinkRanges.top!;
      const next = this.expandRanges[0]!;
      const prevText = document.getText(prev);
      const currentText = document.getText(this.currentRange);
      if (this.currentRange.isEqual(trimInner(document, next))) {
        log.trace('Skipping range with stripped brackets/quotes');
        continue;
      }
      if (currentText === (prevText + ',') ||
          currentText === (prevText + ';')) {
        log.trace('Skipping range ending with comma');
        continue;
      }
      break;
    }
  }

  shrink() {
    if (this.shrinkRanges.isEmpty)
      return;
    this.expandRanges.unshift(this.currentRange);
    this.currentRange = this.shrinkRanges.pop()!;
    this.setSelection();
  }

  private setSelection() {
    if (this.editor.selection.isEqual(this.currentRange))
      return;
    this.editor.selection =
        this.currentRange.asSelection(this.editor.selection.isReversed);
  }

  private expandRanges: Range[] = [];
  private shrinkRanges: Range[] = [];
  currentRange: Range;

  constructor(public editor: TextEditor, selection: Selection) {
    this.currentRange = selection;
  }
}

let currentMode: ExpandMode|undefined;

async function expandOrShrink(arg: {shrink: boolean, listNode?: boolean}) {
  const ctx = await getContext();
  if (!currentMode || currentMode.editor !== ctx.editor ||
      !currentMode.currentRange.isEqual(ctx.selection)) {
    currentMode = new ExpandMode(ctx.editor, ctx.selection);
    await currentMode.init();
  }
  if (arg.shrink)
    currentMode.shrink();
  else
    currentMode.expand();
}

function computeSelectionRange(document: TextDocument, tree: SyntaxTree, position: Position): SelectionRange
{
  let node: SyntaxNode|null =
      findContainingNode(tree.rootNode, position.asRange);
  const ranges: Range[] = [];
  while (node) {
    const inner = trimInner(document, node.range);
    if (node.range.strictlyContains(inner) &&
        (ranges.isEmpty || inner.strictlyContains(ranges.top!)))
      ranges.push(inner);
    ranges.push(node.range);
    node = node.parent;
  }

  log.traceStr('Syntax-based selection range for {}: {}', position, ranges);

  const topSelRange = new SelectionRange(position.asRange);
  let selRange = topSelRange;
  while (!ranges.isEmpty) {
    selRange.parent = new SelectionRange(ranges.shift()!);
    selRange = selRange.parent;
  }
  return topSelRange;
}

async function provideSelectionRanges(
    document: TextDocument, positions: Position[], _: CancellationToken) {
  const tree = await SyntaxTrees.get(document);
  const result = positions.map(pos => computeSelectionRange(document, tree, pos));
  return result;
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  if (currentMode && currentMode.editor.document === event.document)
    currentMode = undefined;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
      languages.registerSelectionRangeProvider(
          SyntaxTrees.supportedLanguages,
          {provideSelectionRanges: handleErrorsAsync(provideSelectionRanges)}),
      registerCommandWrapped(
          'qcfg.selection.expand', () => expandOrShrink({shrink: false})),
      registerCommandWrapped(
          'qcfg.selection.shrink', () => expandOrShrink({shrink: true})),
      registerCommandWrapped(
          'qcfg.selection.selectSuperParent',
          () => expandOrShrink({shrink: false, listNode: true})),
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
}

Modules.register(activate);