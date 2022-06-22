'use strict';

import type {
  ExtensionContext,
  ProviderResult,
  TreeDataProvider,
  TreeItemLabel,
  TreeView,
  TreeViewExpansionEvent,
  TreeViewOptions,
  TreeViewSelectionChangeEvent,
  TreeViewVisibilityChangeEvent,
} from 'vscode';
import {
  EventEmitter,
  TreeItem,
  TreeItemCollapsibleState,
  window,
} from 'vscode';
import { assert, assertNotNull } from '../../library/exception';
import { log } from '../../library/logging';
import { callIfNonNull } from '../../library/tsUtils';
import {
  listenWrapped,
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';

export const TREE_ITEM_REMOVABLE_CONTEXT = 'removable';

export function activate(context: ExtensionContext) {
  const opts: TreeViewOptions<TreeNode> = {
    treeDataProvider,
    showCollapseAll: true,
  };
  treeView = window.createTreeView('qcfgTreeView', opts);
  context.subscriptions.push(
    treeView,
    registerSyncCommandWrapped('qcfg.treeView.removeNode', removeNode),
    registerAsyncCommandWrapped('qcfg.treeView.expandNode', expandNode),
    listenWrapped(
      treeView.onDidExpandElement,
      (event: TreeViewExpansionEvent<TreeNode>) => {
        callIfNonNull(event.element.onDidExpand, event.element);
      },
    ),
    listenWrapped(
      treeView.onDidCollapseElement,
      (event: TreeViewExpansionEvent<TreeNode>) => {
        callIfNonNull(event.element.onDidCollapse, event.element);
      },
    ),
    listenWrapped(
      treeView.onDidChangeSelection,
      (event: TreeViewSelectionChangeEvent<TreeNode>) => {
        if (currentProvider)
          callIfNonNull(
            currentProvider.onDidChangeSelection?.bind(currentProvider),
            event.selection,
          );
      },
    ),
    listenWrapped(
      treeView.onDidChangeVisibility,
      (event: TreeViewVisibilityChangeEvent) => {
        if (currentProvider)
          callIfNonNull(
            currentProvider.onDidChangeVisibility?.bind(currentProvider),
            event.visible,
          );
      },
    ),
  );
}

export interface TreeNode {
  getTreeItem: () => TreeItem | Thenable<TreeItem>;
  getChildren: () => ProviderResult<TreeNode[]>;
  getParent: () => ProviderResult<TreeNode>;
  onDidExpand?: () => void;
  onDidCollapse?: () => void;
  provider?: TreeProvider;
}

export interface TreeProvider {
  getTrees: () => ProviderResult<TreeNode[]>;
  getMessage?: () => string | undefined;
  getTitle?: () => string | undefined;
  removeNode?: (node: TreeNode) => void;
  onDidChangeSelection?: (nodes: readonly TreeNode[]) => void;
  onDidChangeVisibility?: (visible: boolean) => void;
  /** Called when provider becomes inactive, e.g. other provider is set */
  onUnset?: () => void;
}

export namespace QcfgTreeView {
  /** Set current provider of tree data */
  export function setProvider(provider: TreeProvider) {
    if (currentProvider !== provider) {
      if (currentProvider?.onUnset) currentProvider.onUnset();
      currentProvider = provider;
    }
    refresh();
  }

  /**
   * Trigger full refresh of tree
   *
   * Must be called when provider is changed.
   */
  export function refresh() {
    if (!currentProvider) return;
    onChangeEmitter.fire(undefined);
    if (currentProvider.getMessage)
      treeView.message = currentProvider.getMessage();
    if (currentProvider.getTitle) treeView.title = currentProvider.getTitle();
  }

  export function isCurrentProvider(provider: TreeProvider) {
    return currentProvider === provider;
  }

  export interface RevealOptions {
    select?: boolean;
    focus?: boolean;
    expand?: boolean | number;
  }

  export async function revealTree(node?: TreeNode, options?: RevealOptions) {
    if (!node) {
      assertNotNull(currentProvider);
      const nodes = await currentProvider.getTrees();
      if (!nodes || nodes.length === 0) return;
      node = nodes[0];
    }
    return treeView.reveal(node, options);
  }

  export function isVisible() {
    return treeView.visible;
  }

  export function treeChanged(node?: TreeNode) {
    onChangeEmitter.fire(node);
  }
}

// eslint-disable-next-line import/export
export class StaticTreeNode implements TreeNode {
  constructor(label?: TreeItemLabel | string) {
    if (label) {
      this.treeItem = new TreeItem(label);
    } else {
      // TreeItem constructor does not accept undefined label but the class it
      this.treeItem = new TreeItem({ label: '' });
      this.treeItem.label = undefined;
    }
  }

  get isRoot() {
    return this.parent === undefined;
  }

  get isLeaf() {
    return this.children.length === 0;
  }

  addChild(child: StaticTreeNode) {
    assert(child.isRoot);
    child.parent_ = this;
    this.children_.push(child);
    if (this.treeItem.collapsibleState === TreeItemCollapsibleState.None)
      this.treeItem.collapsibleState = TreeItemCollapsibleState.Collapsed;
  }

  detachChildren(): StaticTreeNode[] {
    for (const child of this.children) child.parent_ = undefined;
    const ret = this.children_;
    this.children_ = [];
    return ret;
  }

  addChildren(children: StaticTreeNode[]) {
    for (const child of children) this.addChild(child);
  }

  applyRecursively(func: (_: StaticTreeNode) => boolean) {
    if (!func(this)) return;
    for (const child of this.children_) child.applyRecursively(func);
  }

  sortChildren(cmpFunc?: StaticTreeNode.Compare) {
    StaticTreeNode.sortNodes(this.children_, cmpFunc);
  }

  sortChildrenRecursively(cmpFunc?: StaticTreeNode.Compare) {
    for (const child of this.children) child.sortChildrenRecursively(cmpFunc);
    this.sortChildren(cmpFunc);
  }

  remove() {
    if (!this.parent) {
      this.provider!.removeNode!(this);
      return;
    }
    const parent = this.parent;
    this.parent_ = undefined;
    assert(parent.children_.removeFirst(this));
    if (parent.isLeaf) parent.remove();
    else onChangeEmitter.fire(parent);
  }

  readonly treeItem: TreeItem;
  get children(): StaticTreeNode[] {
    return this.children_;
  }

  get parent(): StaticTreeNode | undefined {
    return this.parent_;
  }

  allowRemoval() {
    this.treeItem.contextValue = TREE_ITEM_REMOVABLE_CONTEXT;
  }

  setExpanded() {
    this.treeItem.collapsibleState = TreeItemCollapsibleState.Expanded;
  }

  setCollapsed() {
    this.treeItem.collapsibleState = TreeItemCollapsibleState.Collapsed;
  }

  // interface implementation
  getTreeItem() {
    return this.treeItem;
  }

  getChildren() {
    return this.children;
  }

  getParent() {
    return this.parent;
  }

  protected children_: StaticTreeNode[] = [];
  private parent_?: StaticTreeNode;
  provider?: TreeProvider;
}

function treeItemLabelToString(item: TreeItem): string {
  const label = item.label;
  if (typeof label === 'string') return label;
  return label?.label ?? '';
}

// eslint-disable-next-line import/export
export namespace StaticTreeNode {
  export type Compare = (a: StaticTreeNode, b: StaticTreeNode) => number;

  export function applyRecursively(
    nodes: StaticTreeNode[],
    func: (_: StaticTreeNode) => boolean,
  ) {
    for (const node of nodes) node.applyRecursively(func);
  }

  export function sortNodes(nodes: StaticTreeNode[], cmpFunc?: Compare) {
    nodes.sort(
      cmpFunc ??
        ((a, b) =>
          treeItemLabelToString(a.treeItem).localeCompare(
            treeItemLabelToString(b.treeItem),
          )),
    );
  }

  export function sortNodesRecursively(
    nodes: StaticTreeNode[],
    cmpFunc?: Compare,
  ) {
    for (const node of nodes) node.sortChildrenRecursively(cmpFunc);
    sortNodes(nodes, cmpFunc);
  }
}

// private

const onChangeEmitter = new EventEmitter<TreeNode | undefined>();

const treeDataProvider: TreeDataProvider<TreeNode> = {
  onDidChangeTreeData: onChangeEmitter.event,
  getTreeItem(node: TreeNode) {
    return node.getTreeItem();
  },
  getChildren(node?: TreeNode) {
    if (node) return node.getChildren();
    if (currentProvider) {
      log.debug('Refreshing the tree');
      return currentProvider.getTrees();
    }
    return;
  },
  getParent(node: TreeNode) {
    return node.getParent();
  },
};

function removeNode(...args: any[]) {
  const node = args[0] as TreeNode;
  assertNotNull(node);
  assertNotNull(currentProvider);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  if (!currentProvider.removeNode)
    throw new Error(
      'TreeProvider with removable nodes must provide removeNode method',
    );
  currentProvider.removeNode(node);
}

async function expandNode(...args: any[]) {
  const node = args[0] as TreeNode;
  assertNotNull(args[0]);
  await treeView.reveal(node, { expand: 3 });
}

let treeView: TreeView<TreeNode>;
let currentProvider: TreeProvider | undefined;

Modules.register(activate);
