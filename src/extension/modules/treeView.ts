'use strict';

import {
  EventEmitter,
  ExtensionContext,
  ProviderResult,
  TreeDataProvider,
  TreeItem,
  TreeItem2,
  TreeItemCollapsibleState,
  TreeItemLabel,
  TreeView,
  TreeViewExpansionEvent,
  TreeViewOptions,
  TreeViewSelectionChangeEvent,
  TreeViewVisibilityChangeEvent,
  window,
} from 'vscode';
import {
  listenWrapped,
  registerSyncCommandWrapped,
  registerAsyncCommandWrapped,
} from './exception';
import { log } from './logging';
import { Modules } from './module';
import { callIfNonNull } from '../../library/tsUtils';

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
          callIfNonNull(currentProvider.onDidChangeSelection, event.selection);
      },
    ),
    listenWrapped(
      treeView.onDidChangeVisibility,
      (event: TreeViewVisibilityChangeEvent) => {
        if (currentProvider)
          callIfNonNull(currentProvider.onDidChangeVisibility, event.visible);
      },
    ),
  );
}

export interface TreeNode {
  getTreeItem(): TreeItem | Thenable<TreeItem>;
  getChildren(): ProviderResult<TreeNode[]>;
  getParent(): ProviderResult<TreeNode>;
  onDidExpand?: () => void;
  onDidCollapse?: () => void;
  provider?: TreeProvider;
}

export interface TreeProvider {
  getTrees(): ProviderResult<TreeNode[]>;
  getMessage?(): string | undefined;
  removeNode?(node: TreeNode): void;
  onDidChangeSelection?(nodes: TreeNode[]): void;
  onDidChangeVisibility?(visible: boolean): void;
  /** Called when provider becomes inactive, e.g. other provider is set */
  onUnset?(): void;
}

export namespace QcfgTreeView {
  export function setProvider(provider: TreeProvider) {
    if (currentProvider !== provider) {
      if (currentProvider && currentProvider.onUnset) currentProvider.onUnset();
      currentProvider = provider;
    }
    refresh();
  }

  export function refresh() {
    if (!currentProvider) return;
    onChangeEmitter.fire();
    if (currentProvider.getMessage)
      treeView.message = currentProvider.getMessage();
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
      const nodes = await log.assertNonNull(currentProvider).getTrees();
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
      if (typeof label === 'string') {
        this.treeItem = new TreeItem2({ label });
      } else {
        this.treeItem = new TreeItem2(label);
      }
    } else {
      this.treeItem = new TreeItem2({ label: '' });
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
    log.assert(child.isRoot);
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
    log.assert(parent.children_.removeFirst(this));
    if (parent.isLeaf) parent.remove();
    else onChangeEmitter.fire(parent);
  }

  readonly treeItem: TreeItem2;
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
      cmpFunc ||
        ((a, b) =>
          (a.treeItem.label || '').localeCompare(b.treeItem.label || '')),
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

const onChangeEmitter = new EventEmitter<TreeNode>();

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
  const node = log.assertNonNull(args[0]) as TreeNode;
  const provider = log.assertNonNull(currentProvider);
  if (!provider.removeNode)
    throw new Error(
      'TreeProvider with removable nodes must provide removeNode method',
    );
  provider.removeNode(node);
}

async function expandNode(...args: any[]) {
  const node = log.assertNonNull(args[0]) as TreeNode;
  await treeView.reveal(node, { expand: 3 });
}

let treeView: TreeView<TreeNode>;
let currentProvider: TreeProvider | undefined;

Modules.register(activate);
