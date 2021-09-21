'use strict';

import type {
  ExtensionContext,
  Selection,
  StatusBarItem,
  TextDocumentChangeEvent,
  TextEditor,
  TextEditorSelectionChangeEvent,
} from 'vscode';
import { Range, window, workspace } from 'vscode';
import {
  assert,
  assertNotNull,
  check,
  checkNotNull,
} from '../../library/exception';
import type { SyntaxNode, SyntaxTree } from '../../library/syntax';
import { RangeDecorator } from '../utils/decoration';
import { setStatusBarErrorBackground } from '../utils/statusBar';
import {
  listenAsyncWrapped,
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import { SyntaxTrees } from './syntaxTree';
import { revealSelection, swapRanges } from './textUtils';
import { getActiveTextEditor, WhenContext } from './utils';

const WHEN_CLAUSE = 'qcfgTreeMode';

const siblingDecorator = RangeDecorator.bracketStyle({
  // TODO: use color conversion lib, candidates (both are typed):
  // https://www.npmjs.com/package/color-string
  // https://www.npmjs.com/package/color-convert
  color: 'rgba(255, 255, 255, 0.50)',
  width: 2,
});

const parentDecorator = RangeDecorator.bracketStyle({
  color: 'rgba(255, 255, 0, 0.50)',
  width: 2,
});

class SelectedNodes {
  constructor(
    public start: SyntaxNode,
    public end: SyntaxNode,
    public isReversed = false,
  ) {
    assert(start.parent === end.parent);
    assert(start.parent !== null);
  }

  static directed(anchor: SyntaxNode, active: SyntaxNode) {
    if (anchor.startIndex > active.startIndex)
      return new SelectedNodes(active, anchor, true /* isReversed */);
    return new SelectedNodes(anchor, active);
  }

  get parent(): SyntaxNode {
    return this.start.parent!;
  }

  reverse() {
    this.isReversed = !this.isReversed;
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

  get selection(): Selection {
    return this.range.asSelection(this.isReversed);
  }

  get isSingle() {
    return this.start === this.end;
  }

  get single() {
    if (this.start === this.end) return this.start;
    return undefined;
  }
}

interface Context {
  editor: TextEditor;
  tree: SyntaxTree;
  selectedNodes: SelectedNodes;
  /** History of expanding to parent node */
  history: SelectedNodes[];
}

let context: undefined | Context;

function updateSelection() {
  const { editor, selectedNodes } = context!;
  editor.selection = selectedNodes.selection;
  revealSelection(editor);
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
    const child = root.child(i)!;
    const foundInChild = findContainingNode(child, range, strict);
    if (foundInChild) return foundInChild;
  }
  if (root.range.contains(range)) return root;
  return undefined;
}

function inferSelectedNodes(
  root: SyntaxNode,
  selection: Selection,
): SelectedNodes | undefined {
  let parent = findContainingNode(root, selection, true /* strict */);
  if (!parent) return;
  if (parent.isLeaf) {
    if (parent.parent) parent = parent.parent;
    else return;
  }

  let firstItem: SyntaxNode | undefined;
  let lastItem: SyntaxNode | undefined;
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
  return new SelectedNodes(firstItem, lastItem, selection.isReversed);
}

function parseDirection(direction: string): {
  reversed: boolean;
  terminal: boolean;
} {
  switch (direction) {
    case 'first':
      return { reversed: true, terminal: true };
    case 'last':
      return { reversed: false, terminal: true };
    case 'left':
      return { reversed: true, terminal: false };
    case 'right':
      return { reversed: false, terminal: false };
    default:
      throw new Error(`Invalid direction: ${direction}`);
  }
}

function selectSibling(direction: string) {
  const { reversed, terminal } = parseDirection(direction);
  validateContext(context);
  const { selectedNodes } = context;
  const { single } = selectedNodes;
  if (single) {
    const sibling = getSibling(single, reversed, terminal);
    check(sibling !== single, 'Can not go in this direction');
    selectedNodes.start = sibling;
    selectedNodes.end = sibling;
    context.history.clear();
    updateSelection();
    return;
  }

  // if multiple nodes selected, select first/last one
  const node = reversed ? selectedNodes.start : selectedNodes.end;
  selectedNodes.start = node;
  selectedNodes.end = node;
  context.history.clear();
  updateSelection();
}

async function moveSelection(direction: string) {
  const reversed = direction === 'left';
  validateContext(context);
  const { editor, selectedNodes } = context;
  const active = reversed ? selectedNodes.start : selectedNodes.end;
  const sibling = adjacentSibling(active, reversed);
  check(sibling !== active, 'Can not move in this direction');
  await exitMode();
  await swapRanges(editor, sibling.range, selectedNodes.range);
  await enterMode();
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

function extendSelection(direction: string) {
  const { reversed, terminal } = parseDirection(direction);
  assertNotNull(context?.selectedNodes);
  const { selectedNodes } = context;
  const newActive = getSibling(selectedNodes.active, reversed, terminal);
  check(newActive !== selectedNodes.active, 'Can not extend in this direction');
  context.selectedNodes = SelectedNodes.directed(
    selectedNodes.anchor,
    newActive,
  );
  context.history.clear();
  updateSelection();
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
  'source_file',
];

function isListParent(node: SyntaxNode) {
  return LIST_PARENT_TYPES.includes(node.type);
}

function isListItem(node: SyntaxNode) {
  return !node.parent || isListParent(node.parent);
}

export async function enterMode() {
  if (context) {
    return;
  }

  const editor = getActiveTextEditor();
  check(
    editor.selections.length === 1,
    'Tree mode does not support multiple selections',
  );

  const { document, selection } = editor;
  const tree = await SyntaxTrees.get(document);
  const selectedNodes = inferSelectedNodes(tree.rootNode, selection);
  assertNotNull(selectedNodes, 'Could not infer tree nodes from selection');
  context = {
    editor,
    tree,
    selectedNodes,
    history: [],
  };
  updateSelection();
  updateDecorations();
  await WhenContext.set(WHEN_CLAUSE);
  status!.show();
}

/** When moving up/down (or entering mode) update parent and sibling decorations */
function updateDecorations() {
  assertNotNull(context);
  const { editor } = context;
  const parent = context.selectedNodes.parent;
  parentDecorator.decorate(editor, [parent.range]);
  siblingDecorator.decorate(
    editor,
    parent.namedChildren.map((child) => child.range),
  );
}

function validateContext(
  someContext: Context | undefined,
): asserts someContext is NonNullable<Context> {
  const editor = getActiveTextEditor();
  assert(editor.selections.length === 1);
  const { document, selection } = editor;
  assertNotNull(someContext);
  assertNotNull(someContext.editor === editor);
  assertNotNull(someContext.tree.version === document.version);
  assertNotNull(selection.isEqual(someContext.selectedNodes.range));
}

export async function onSelectionChanged(
  event: TextEditorSelectionChangeEvent,
) {
  if (
    !context ||
    event.textEditor !== context.editor ||
    event.selections.length > 1 ||
    !event.selections[0].isEqual(context.selectedNodes.selection)
  )
    return exitMode();
}

export async function exitMode() {
  if (!context) return;

  parentDecorator.clear(context.editor);
  siblingDecorator.clear(context.editor);
  context = undefined;
  status!.hide();
  await WhenContext.clear(WHEN_CLAUSE);
}

function selectNodesAndDecorate(selection: SelectedNodes) {
  context!.selectedNodes = selection;
  updateSelection();
  updateDecorations();
}

function selectNodeAndDecorate(node: SyntaxNode) {
  selectNodesAndDecorate(new SelectedNodes(node, node));
}

function selectParent() {
  validateContext(context);
  check(
    context.selectedNodes.parent !== context.tree.rootNode,
    'Can not select root node',
  );
  context.history.push(context.selectedNodes);
  selectNodeAndDecorate(context.selectedNodes.parent);
}

/** Find predecessor list item and select it */
function selectParentListItem() {
  validateContext(context);
  let node: SyntaxNode | null = context.selectedNodes.parent;
  while (node && !isListItem(node)) {
    node = node.parent;
  }
  checkNotNull(node, 'Could not find parent list item');
  context.history.push(context.selectedNodes);
  selectNodeAndDecorate(node);
}

function shrink() {
  validateContext(context);
  const prevSelection = context.history.pop();
  if (prevSelection) {
    selectNodesAndDecorate(prevSelection);
    return;
  }
  const node = context.selectedNodes.single;
  checkNotNull(node, 'Multiple nodes selected');
  const firstChild = node.firstNamedChild;
  checkNotNull(firstChild, 'Selected node has no children');
  selectNodeAndDecorate(firstChild);
}

function reverseSelection() {
  validateContext(context);
  const { editor, selectedNodes: selection } = context;
  selection.reverse();
  editor.selection = editor.selection.reverse();
  revealSelection(editor);
}

let status: StatusBarItem | undefined;

function activate(extContext: ExtensionContext) {
  status = window.createStatusBarItem('qcfgTreeMode');
  status.name = 'qcfg: Tree mode';
  status.text = 'Tree mode';
  setStatusBarErrorBackground(status);

  extContext.subscriptions.push(
    listenAsyncWrapped(
      window.onDidChangeTextEditorSelection,
      onSelectionChanged,
    ),
    listenAsyncWrapped(
      workspace.onDidChangeTextDocument,
      async (_: TextDocumentChangeEvent) => exitMode(),
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.enter', enterMode),
    registerSyncCommandWrapped(
      'qcfg.treeMode.reverseSelection',
      reverseSelection,
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.exit', exitMode),
    registerSyncCommandWrapped('qcfg.treeMode.selectParent', selectParent),
    registerSyncCommandWrapped('qcfg.treeMode.shrink', shrink),
    registerSyncCommandWrapped(
      'qcfg.treeMode.selectParentListItem',
      selectParentListItem,
    ),
    registerSyncCommandWrapped('qcfg.treeMode.selectSibling', selectSibling),
    registerSyncCommandWrapped(
      'qcfg.treeMode.extendSelection',
      extendSelection,
    ),
    registerAsyncCommandWrapped('qcfg.treeMode.moveSelection', moveSelection),
  );
}

Modules.register(activate);
