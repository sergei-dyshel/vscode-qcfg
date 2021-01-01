'use strict';

import type {
  ExtensionContext,
  TextEditor,
  TextDocumentChangeEvent,
  TextEditorSelectionChangeEvent,
  Selection,
} from 'vscode';
import { commands, Range, window, workspace, ThemeColor } from 'vscode';
import {
  registerAsyncCommandWrapped,
  listenAsyncWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import type { SyntaxNode, SyntaxTree } from './syntaxTree';
import { SyntaxTrees } from './syntaxTree';
import {
  selectRange,
  swapRanges,
  trimWhitespace,
  trimBrackets,
} from './textUtils';
import { getActiveTextEditor, WhenContext } from './utils';
import {
  assertNonNull,
  check,
  assert,
  assertNotNull,
} from '../../library/exception';
import { stringify as str } from '../../library/stringify';
import { RangeDecorator } from '../utils/decoration';

const WHEN_CLAUSE = 'qcfgTreeMode';

const siblingDecorator = new RangeDecorator(
  '2px solid rgba(255, 255, 255, 0.50)',
);
const parentDecorator = new RangeDecorator('2px solid rgba(255, 255, 0, 0.50)');

const modeDecorator = window.createTextEditorDecorationType({
  backgroundColor: new ThemeColor('diffEditor.removedTextBackground'),
});

class SiblingSelection {
  readonly start: SyntaxNode;
  readonly end: SyntaxNode;
  constructor(
    node1: SyntaxNode,
    node2: SyntaxNode,
    readonly isReversed = false,
  ) {
    assert(node1.parent === node2.parent);
    assert(node1.parent !== null);
    [this.start, this.end] = isOrderReversed(node1, node2)
      ? [node2, node1]
      : [node1, node2];
  }

  get parent(): SyntaxNode {
    return this.start.parent!;
  }

  reverse() {
    return new SiblingSelection(this.start, this.end, !this.isReversed);
  }

  get active() {
    return this.isReversed ? this.start : this.end;
  }

  get anchor() {
    return this.isReversed ? this.end : this.start;
  }

  get range(): Range {
    return new Range(this.start.start, this.end.end);
  }

  get editorSelection(): Selection {
    return this.range.asSelection(this.isReversed);
  }

  get isSingle() {
    return this.start === this.end;
  }
}

function isOrderReversed(anchor: SyntaxNode, active: SyntaxNode): boolean {
  return anchor.startIndex > active.startIndex;
}

let context:
  | undefined
  | {
      editor: TextEditor;
      tree: SyntaxTree;
      range: Range;
      listSelection: SiblingSelection | undefined;
    };

let selectionChangeExpected = true;

async function expectSelectionChange<T>(promise: Promise<T>): Promise<T> {
  selectionChangeExpected = true;
  const res = await promise;
  selectionChangeExpected = false;
  return res;
}

export function findContainingNode(
  root: SyntaxNode,
  range: Range,
  strict = false,
): SyntaxNode | undefined {
  if (root.range.isEqual(range)) {
    if (strict) return undefined;
    return root;
  }
  for (let i = 0; i < root.childCount; ++i) {
    const child = root.child(i) as SyntaxNode;
    const foundInChild = findContainingNode(child, range, strict);
    if (foundInChild) return foundInChild;
  }
  if (root.range.contains(range)) return root;
  return undefined;
}

// function goUpToContainingNode(
//   node: SyntaxNode,
//   range: Range,
// ): SyntaxNode | undefined {
//   let node_: SyntaxNode | undefined = node;
//   while (node_ && !node_.range.contains(range))
//     node_ = node_.parent ?? undefined;
//   return node_;
// }

function findAndAssertContainingNode(
  root: SyntaxNode,
  range: Range,
  strict = false,
): SyntaxNode {
  const contNode = findContainingNode(root, range, strict);
  return assertNonNull<SyntaxNode>(
    contNode,
    `${str(root)} does not contain ${str(range)}`,
  );
}

function getListSelection(
  root: SyntaxNode,
  selection: Selection,
): SiblingSelection | undefined {
  let parent = findContainingNode(root, selection, true /* strict */);
  if (!parent) return;

  let firstItem: SyntaxNode | undefined;
  let lastItem: SyntaxNode | undefined;

  while (parent && !isListParent(parent)) {
    parent = parent.parent ?? undefined;
  }
  if (!parent) return;
  for (let i = 0; i < parent.namedChildCount; ++i) {
    const child = parent.namedChild(i)!;
    if (!firstItem && selection.start.isBeforeOrEqual(child.range.end))
      firstItem = child;
    if (selection.end.isAfterOrEqual(child.range.start)) {
      lastItem = child;
    } else if (selection.end.isBefore(child.range.start)) {
      break;
    }
  }
  if (!firstItem || !lastItem) return;
  return new SiblingSelection(firstItem, lastItem, selection.isReversed);
}

function selectListItems(
  node1: SyntaxNode,
  node2: SyntaxNode,
  reversed: boolean,
) {
  assertNotNull(context);
  const { editor } = context;
  context.listSelection = new SiblingSelection(node1, node2, reversed);
  const range = context.listSelection.range;
  editor.setDecorations(modeDecorator, [range]);
  context.range = range;
  selectRange(editor, range, reversed);
}

async function selectSibling(reversed: boolean, terminal = false) {
  assertNotNull(context?.listSelection);
  const { listSelection } = context;
  const { editor } = context;
  if (!ensureListItemRangeSelected(editor)) {
    return enterMode();
  }
  const node = listSelection.active;
  const sibling = getSibling(node, reversed, terminal);
  check(
    sibling !== node || !listSelection.isSingle,
    'Can not go in this direction',
  );
  selectListItems(sibling, sibling, reversed);
}

async function swapWithAdjacentSibling(reversed: boolean) {
  assertNotNull(context?.listSelection);
  const { listSelection } = context;
  const { editor } = context;
  if (!ensureListItemRangeSelected(editor)) {
    return enterMode();
  }
  const node = reversed ? listSelection.start : listSelection.end;
  const sibling = adjacentSibling(node, reversed);
  check(sibling !== node, 'Can not swap in this direction');
  await swapRanges(editor, sibling.range, listSelection.range);
  return enterMode();
}

function adjacentSibling(node: SyntaxNode, reversed: boolean) {
  return reversed ? node.previousNamedSiblingSafe : node.nextNamedSiblingSafe;
}

function terminalSibling(node: SyntaxNode, reversed: boolean) {
  // faster would be to go to parent and this loop also covers the case where
  // there is no parent
  let adj = adjacentSibling(node, reversed);
  while (adj !== node) {
    node = adj;
    adj = adjacentSibling(node, reversed);
  }
  return adj;
}

function getSibling(node: SyntaxNode, reversed: boolean, terminal: boolean) {
  return terminal
    ? terminalSibling(node, reversed)
    : adjacentSibling(node, reversed);
}

async function extendSelection(reversed: boolean, terminal = false) {
  assertNotNull(context?.listSelection);
  const { listSelection } = context;
  const { editor } = context;
  if (!ensureListItemRangeSelected(editor)) {
    return enterMode();
  }
  const newActive = getSibling(listSelection.active, reversed, terminal);
  selectListItems(
    newActive,
    listSelection.anchor,
    isOrderReversed(listSelection.anchor, newActive),
  );
}

const LIST_PARENT_TYPES: string[] = [
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
  'argument_list',
  'binary_expression',
];

function isListParent(node: SyntaxNode) {
  return true;
  return LIST_PARENT_TYPES.includes(node.type);
}

function isListItem(node: SyntaxNode) {
  return !node.parent || isListParent(node.parent);
}

function getContainingListItem(
  tree: SyntaxTree,
  range: Range,
  strict = false,
): SyntaxNode | undefined {
  let node: SyntaxNode | undefined = findAndAssertContainingNode(
    tree.rootNode,
    range,
    strict,
  );
  while (node && !isListItem(node)) node = node.parent ?? undefined;
  return node;
}

export async function toggleModeOn() {
  if (context) {
    return;
  }

  const editor = getActiveTextEditor();
  check(
    editor.selections.length === 1,
    'Expand/shrink mode does not work with multiple selections',
  );
  const selection = editor.selection;
  await commands.executeCommand('editor.action.smartSelect.expand');
  check(
    !editor.selection.isEqual(selection),
    'Could not enter expand/shrink mode',
  );

  await enterMode();
}

function ensureListItemRangeSelected(editor: TextEditor) {
  const listSelection = assertNonNull(context?.listSelection);
  const range = listSelection.range;
  if (!editor.selection.isEqual(range)) {
    editor.selection = range.asSelection();
    return false;
  }
  return true;
}

async function enterMode() {
  const editor = getActiveTextEditor();
  const { document, selection } = editor;
  const tree =
    context &&
    context.editor === editor &&
    context.tree.version === document.version
      ? context.tree
      : await SyntaxTrees.get(document);
  await WhenContext.set(WHEN_CLAUSE);
  context = {
    editor,
    tree,
    range: selection,
    listSelection: getListSelection(tree.rootNode, selection),
  };
  editor.setDecorations(modeDecorator, [selection]);
  const node = getContainingListItem(tree, selection, true /* strict */);
  if (node) parentDecorator.decorate(editor, [node.range]);
  else parentDecorator.clear(editor);
  if (context.listSelection?.editorSelection.isEqual(selection)) {
    siblingDecorator.decorate(
      editor,
      context.listSelection.parent.namedChildren.map((child) => child.range),
    );
  } else {
    siblingDecorator.clear(editor);
  }
}

export async function onSelectionChanged(
  event: TextEditorSelectionChangeEvent,
) {
  if (selectionChangeExpected) return;
  if (
    !context ||
    event.textEditor !== context.editor ||
    event.selections.length > 1 ||
    !event.selections[0].isEqual(context.range)
  )
    return exitMode();
}

export async function exitMode() {
  if (!context) return;

  context.editor.setDecorations(modeDecorator, []);
  parentDecorator.clear(context.editor);
  siblingDecorator.clear(context.editor);
  context = undefined;
  await WhenContext.clear(WHEN_CLAUSE);
}

async function smartSelectExpand() {
  return commands.executeCommand('editor.action.smartSelect.expand');
}

async function smartSelectShrink() {
  return commands.executeCommand('editor.action.smartSelect.shrink');
}

export async function expand() {
  await expectSelectionChange(smartSelectExpand());
  return enterMode();
}

async function expandFasterImpl() {
  assertNotNull(context);
  const { editor } = context;
  const document = editor.document;
  const selection = editor.selection;
  await smartSelectExpand();
  const selection1 = editor.selection;
  if (selection1.isEqual(selection)) return;
  await smartSelectExpand();
  const selection2 = editor.selection;
  if (
    selection2.isEqual(selection1) ||
    trimBrackets(document, selection2).isEqual(selection1) ||
    trimWhitespace(document, selection1).isEqual(selection)
  ) {
    return;
  }
  await smartSelectShrink();
}

async function expandFaster() {
  await expandFasterImpl();
  await enterMode();
}

async function expandToListItem() {
  assertNotNull(context);
  const { editor } = context;
  for (;;) {
    await expectSelectionChange(smartSelectExpand());
    const node = findContainingNode(
      context.tree.rootNode,
      editor.selection,
      false /* not strict */,
    );
    if (!node) break;
    if (!node.range.isEqual(editor.selection)) continue;
    if (isListItem(node)) break;
  }
  return enterMode();
}

async function shrink() {
  await expectSelectionChange(smartSelectShrink());
  if (getActiveTextEditor().selection.isEmpty) return exitMode();
  return enterMode();
}

async function shrinkFaster() {
  assertNotNull(context);
  const { editor } = context;
  const { document } = editor;
  const { selection } = editor;
  await smartSelectShrink();
  const selection1 = editor.selection;
  if (
    selection1.isEqual(selection) ||
    trimBrackets(document, selection).isEqual(selection1)
  )
    await smartSelectShrink();
  await enterMode();
}

async function shrinkToListItem() {
  assertNotNull(context);
  const { editor } = context;
  for (;;) {
    await expectSelectionChange(smartSelectShrink());
    const node = findContainingNode(
      context.tree.rootNode,
      editor.selection,
      false /* not strict */,
    );
    if (!node) break;
    if (!node.range.isEqual(editor.selection)) continue;
    if (isListItem(node)) break;
  }
  return enterMode();
}

function reverseSelection() {
  assertNotNull(context);
  const { editor, listSelection } = context;
  editor.selection = editor.selection.reverse();
  if (listSelection) {
    context.listSelection = listSelection.reverse();
  }
}

function activate(extContext: ExtensionContext) {
  extContext.subscriptions.push(
    listenAsyncWrapped(
      window.onDidChangeTextEditorSelection,
      onSelectionChanged,
    ),
    listenAsyncWrapped(
      workspace.onDidChangeTextDocument,
      async (_: TextDocumentChangeEvent) => exitMode(),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.enter', toggleModeOn),
    registerSyncCommandWrapped(
      'qcfg.treeMode.reverseSelection',
      reverseSelection,
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.exit', exitMode),
    registerAsyncCommandWrapped('qcfg.treeMode.expand', expand),
    registerAsyncCommandWrapped('qcfg.treeMode.shrink', shrink),
    registerAsyncCommandWrapped('qcfg.treeMode.expandFaster', expandFaster),
    registerAsyncCommandWrapped('qcfg.treeMode.shrinkFaster', shrinkFaster),
    registerAsyncCommandWrapped('qcfg.treeMode.expandToList', expandToListItem),
    registerAsyncCommandWrapped('qcfg.treeMode.shrinkToList', shrinkToListItem),
    registerAsyncCommandWrapped('qcfg.treeMode.goToStart', async () =>
      selectSibling(true /* start */, true /* terminal */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.goToEnd', async () =>
      selectSibling(false /* end */, true /* terminal */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.goLeft', async () =>
      selectSibling(true /* left */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.goRight', async () =>
      selectSibling(false /* right */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.extendToLeft', async () =>
      extendSelection(true /* left */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.extendToRight', async () =>
      extendSelection(false /* right */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.extendToStart', async () =>
      extendSelection(true /* left */, true /* terminal */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.extendToEnd', async () =>
      extendSelection(false /* right */, true /* termrinal */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.swapLeft', async () =>
      swapWithAdjacentSibling(true /* left */),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.swapRight', async () =>
      swapWithAdjacentSibling(false /* right */),
    ),
  );
}

Modules.register(activate);
