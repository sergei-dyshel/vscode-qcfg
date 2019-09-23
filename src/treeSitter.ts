'use strict';

import { CancellationToken, commands, ExtensionContext, languages, Position, Range, Selection, SelectionRange, TextDocument, TextDocumentChangeEvent, TextEditor, workspace } from 'vscode';
import { handleErrorsAsync, listenWrapped, registerCommandWrapped } from './exception';
import { Logger, str } from './logging';
import { Modules } from './module';
import { SyntaxNode, SyntaxTree, SyntaxTrees } from './syntaxTree';
import { selectRange, swapRanges, trimInner, trimWhitespace, trimBrackets } from './textUtils';
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
  return undefined;
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

function getContextNoTree() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  if (editor.selections.length > 1)
    throw new Error('Not applicable to multiple selections');
  return {editor, document, selection};
}

async function getContext() {
  const ctx = getContextNoTree();
  const tree = await SyntaxTrees.get(ctx.document);
  return {tree, ...ctx};
}

async function selectSibling(direction: Direction, swap?: boolean) {
  let ctx = await getContext();
  const {parent, firstChild, lastChild} =
      findContainingChildren(ctx.tree.rootNode, ctx.selection);
  log.traceStr(
      'Found for list syntax nodes containing {}: from {} - to {}',
      ctx.selection, firstChild, lastChild);
  let node = (firstChild !== lastChild) ?
      (direction === Direction.Left ? firstChild : lastChild) :
      firstChild;
  const sibling = node.range.isEqual(ctx.selection) ?
      (direction === Direction.Left ? (node.previousNamedSibling || node) :
                                      (node.nextNamedSibling || node)) :
      node;
  if (!sibling)
        return;
  if (sibling === node) {
    selectChildren(ctx.editor, node, node, direction === Direction.Left);
    return;
  }
  let siblingRange = sibling.range;
  if (swap && parent !== node) {
    await swapRanges(ctx.editor, node.range, siblingRange);
    ctx = await getContext();
    node = findContainingNode(ctx.tree.rootNode, ctx.selection);
    siblingRange = node.range;
  }

  selectAndRememberRange(ctx.editor, siblingRange);
}

async function extendSelection(direction: Direction) {
  const ctx = await getContext();
  let {firstChild, lastChild} =
      findContainingChildren(ctx.tree.rootNode, ctx.selection);
  log.traceStr(
      'Found for list syntax nodes containing {}: from {} - to {}',
      ctx.selection, firstChild, lastChild);
  const childRange = childrenRange(firstChild, lastChild);
  if (!childRange.isEqual(ctx.selection)) {
    selectChildren(ctx.editor, firstChild, lastChild);
  } else {
    if (direction === Direction.Left) {
      if (ctx.selection.isReversed)
        firstChild = firstChild.previousNamedSibling || firstChild;
      else if (firstChild !== lastChild)
        lastChild = lastChild.previousNamedSibling || lastChild;
    }
    else if (direction === Direction.Right) {
      if (!ctx.selection.isReversed)
        lastChild = lastChild.nextNamedSibling || lastChild;
      else if (firstChild !== lastChild)
        firstChild = firstChild.nextNamedSibling || firstChild;
    }
    selectChildren(ctx.editor, firstChild, lastChild, ctx.selection.isReversed);
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

class ExpandMode {
  async init() {
    const document = this.editor.document;
    const position = this.currentRange.end;
    let wordRange = document.getWordRangeAtPosition(position);
    // In json for some reason word includes quotes
    if (wordRange)
      wordRange = trimBrackets(document, wordRange);
    const result = await commands.executeCommand(
        'vscode.executeSelectionRangeProvider', document.uri, [position]);
    const allSelRanges = result as SelectionRange[];
    let selRange: SelectionRange|undefined = allSelRanges[0];
    while (selRange) {
      const range = selRange.range;
      const inner = trimInner(document, range);
      if (!inner.isEqual(range) && inner.strictlyContains(this.currentRange) &&
          (!wordRange || inner.contains(wordRange)) &&
          (this.expandRanges.isEmpty || this.expandRanges.top!.isEqual(inner)))
        this.expandRanges.push(inner);
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
  const ctx = await getContextNoTree();
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