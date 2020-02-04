'use strict';

import {
  commands,
  ExtensionContext,
  languages,
  Position,
  Range,
  SelectionRange,
  TextDocument,
  TextEditor,
} from 'vscode';
import { handleErrorsAsync, registerAsyncCommandWrapped } from './exception';
import { Logger } from './logging';
import { Modules } from './module';
import { SyntaxNode, SyntaxTree, SyntaxTrees } from './syntaxTree';
import {
  selectRange,
  swapRanges,
  trimInner,
  trimWhitespace,
} from './textUtils';
import { getActiveTextEditor } from './utils';
import { assertNonNull } from '../../library/exception';
import { stringify as str } from 'querystring';

const log = new Logger({ level: 'trace' });

enum Direction {
  Left,
  Right,
}

function selectAndRememberRange(
  editor: TextEditor,
  range: Range,
  reversed?: boolean,
) {
  selectRange(editor, range, reversed);
}

function findContainingNodeImpl(
  node: SyntaxNode,
  range: Range,
): SyntaxNode | undefined {
  if (node.range.isEqual(range)) return node;
  for (let i = 0; i < node.childCount; ++i) {
    const child = node.child(i) as SyntaxNode;
    const foundInChild = findContainingNodeImpl(child, range);
    if (foundInChild) return foundInChild;
  }
  if (node.range.contains(range)) return node;
  return undefined;
}

function findContainingNode(node: SyntaxNode, range: Range): SyntaxNode {
  const contNode = findContainingNodeImpl(node, range);
  return assertNonNull<SyntaxNode>(
    contNode,
    `${str(node)} does not contain ${str(range)}`,
  );
}

function findContainingChildren(root: SyntaxNode, range: Range) {
  let parent: SyntaxNode = findContainingNode(root, range);
  let firstChild: SyntaxNode | undefined;
  let lastChild: SyntaxNode | undefined;

  if (parent.range.isEqual(range)) parent = assertNonNull(parent.parent);
  while (!isListNode(parent)) {
    parent = assertNonNull(parent.parent);
  }
  for (let i = 0; i < parent.namedChildCount; ++i) {
    const child = parent.namedChild(i)!;
    if (child.range.contains(range.start)) firstChild = child;
    if (child.range.contains(range.end)) {
      lastChild = child;
      break;
    }
  }
  if (!firstChild || !lastChild)
    throw new Error('Could not identify children nodes');
  return { parent, firstChild, lastChild };
}

function childrenRange(firstChild: SyntaxNode, lastChild: SyntaxNode): Range {
  return new Range(firstChild.start, lastChild.end);
}

function selectChildren(
  editor: TextEditor,
  firstChild: SyntaxNode,
  lastChild: SyntaxNode,
  reversed?: boolean,
) {
  selectAndRememberRange(
    editor,
    childrenRange(firstChild, lastChild),
    reversed,
  );
}

function getContextNoTree() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  if (editor.selections.length > 1)
    throw new Error('Not applicable to multiple selections');
  return { editor, document, selection };
}

async function getContext() {
  const ctx = getContextNoTree();
  const tree = await SyntaxTrees.get(ctx.document);
  return { tree, ...ctx };
}

async function selectSibling(direction: Direction, swap?: boolean) {
  let ctx = await getContext();
  const { parent, firstChild, lastChild } = findContainingChildren(
    ctx.tree.rootNode,
    ctx.selection,
  );
  log.traceStr(
    'Found for list syntax nodes containing {}: from {} - to {}',
    ctx.selection,
    firstChild,
    lastChild,
  );
  let node =
    firstChild !== lastChild
      ? direction === Direction.Left
        ? firstChild
        : lastChild
      : firstChild;
  const sibling = node.range.isEqual(ctx.selection)
    ? direction === Direction.Left
      ? node.previousNamedSibling || node
      : node.nextNamedSibling || node
    : node;
  if (!sibling) return;
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
  let { firstChild, lastChild } = findContainingChildren(
    ctx.tree.rootNode,
    ctx.selection,
  );
  log.traceStr(
    'Found for list syntax nodes containing {}: from {} - to {}',
    ctx.selection,
    firstChild,
    lastChild,
  );
  const childRange = childrenRange(firstChild, lastChild);
  if (!childRange.isEqual(ctx.selection)) {
    selectChildren(ctx.editor, firstChild, lastChild);
    return;
  }
  if (direction === Direction.Left) {
    if (ctx.selection.isReversed)
      firstChild = firstChild.previousNamedSibling || firstChild;
    else if (firstChild !== lastChild)
      lastChild = lastChild.previousNamedSibling || lastChild;
  } else if (direction === Direction.Right) {
    if (!ctx.selection.isReversed)
      lastChild = lastChild.nextNamedSibling || lastChild;
    else if (firstChild !== lastChild)
      firstChild = firstChild.nextNamedSibling || firstChild;
  }
  selectChildren(ctx.editor, firstChild, lastChild, ctx.selection.isReversed);
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
  'parameter_list',
];

function isListNode(node: SyntaxNode) {
  return LIST_NODE_TYPES.includes(node.type);
}

function computeSelectionRange(
  document: TextDocument,
  tree: SyntaxTree,
  position: Position,
): SelectionRange {
  let node: SyntaxNode | null = findContainingNode(
    tree.rootNode,
    position.asRange,
  );
  const ranges: Range[] = [];
  while (node) {
    const inner = trimInner(document, node.range);
    if (
      node.range.strictlyContains(inner) &&
      (ranges.isEmpty || inner.strictlyContains(ranges.top!))
    )
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
  document: TextDocument,
  positions: Position[],
) {
  const tree = await SyntaxTrees.get(document);
  return positions.map(pos => computeSelectionRange(document, tree, pos));
}

async function smartExpand() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  await commands.executeCommand('editor.action.smartSelect.expand');
  const selection1 = editor.selection;
  if (selection1.isEqual(selection)) return;
  await commands.executeCommand('editor.action.smartSelect.expand');
  const selection2 = editor.selection;
  if (selection2.isEqual(selection1)) return;
  if (
    (trimInner(document, selection2).isEqual(selection1) &&
      !trimWhitespace(document, selection2).isEqual(selection1)) ||
    trimWhitespace(document, selection1).isEqual(selection)
  ) {
    return;
  }
  await commands.executeCommand('editor.action.smartSelect.shrink');
}

async function smartShrink() {
  await commands.executeCommand('editor.action.smartSelect.shrink');
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerSelectionRangeProvider(SyntaxTrees.supportedLanguages, {
      provideSelectionRanges: handleErrorsAsync(provideSelectionRanges),
    }),
    registerAsyncCommandWrapped('qcfg.selection.expand', smartExpand),
    registerAsyncCommandWrapped('qcfg.selection.shrink', smartShrink),
    registerAsyncCommandWrapped('qcfg.selection.left', () =>
      selectSibling(Direction.Left),
    ),
    registerAsyncCommandWrapped('qcfg.selection.right', () =>
      selectSibling(Direction.Right),
    ),
    registerAsyncCommandWrapped('qcfg.selection.extendLeft', () =>
      extendSelection(Direction.Left),
    ),
    registerAsyncCommandWrapped('qcfg.selection.extendRight', () =>
      extendSelection(Direction.Right),
    ),
    registerAsyncCommandWrapped('qcfg.selection.swapLeft', () =>
      selectSibling(Direction.Left, true /* swap */),
    ),
    registerAsyncCommandWrapped('qcfg.selection.swapRight', () =>
      selectSibling(Direction.Right, true /* swap */),
    ),
  );
}

Modules.register(activate);
