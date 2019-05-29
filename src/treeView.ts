'use strict';

import * as vscode from 'vscode';
import { TreeItem, ProviderResult, Uri } from 'vscode';
import { callIfNonNull, removeFirstFromArray } from './tsUtils';
import { Logger } from './logging';
import { registerCommand } from './utils';

const log = Logger.create('treeView');

export const TREE_ITEM_REMOVABLE_CONTEXT = 'removable';

export function activate(context: vscode.ExtensionContext) {
  const opts: vscode.TreeViewOptions<TreeNode> = {
    showCollapseAll: true,
    'treeDataProvider': treeDataProvider
  };
  treeView = vscode.window.createTreeView('qcfgTreeView', opts);
  context.subscriptions.push(
      treeView,
      registerCommand('qcfg.treeView.removeNode', removeNode),
      treeView.onDidExpandElement(
          (event: vscode.TreeViewExpansionEvent<TreeNode>) => {
            callIfNonNull(event.element.onDidExpand, event.element);
          }),
      treeView.onDidCollapseElement(
          (event: vscode.TreeViewExpansionEvent<TreeNode>) => {
            callIfNonNull(event.element.onDidCollapse, event.element);
          }),
      treeView.onDidChangeSelection(
          (event: vscode.TreeViewSelectionChangeEvent<TreeNode>) => {
            if (currentProvider)
              callIfNonNull(
                  currentProvider.onDidChangeSelection, event.selection);
          }),
      treeView.onDidChangeVisibility(
          (event: vscode.TreeViewVisibilityChangeEvent) => {
            if (currentProvider)
              callIfNonNull(
                  currentProvider.onDidChangeVisibility, event.visible);
          }));
}

export interface TreeNode {
  getTreeItem(): TreeItem | Thenable<TreeItem>;
  getChildren(): ProviderResult<TreeNode[]>;
  getParent(): ProviderResult<TreeNode>;
  onDidExpand?: () => void;
  onDidCollapse?: () => void;
}

export interface TreeProvider {
  getTrees(): ProviderResult<TreeNode[]>;
  getMessage?(): string | vscode.MarkdownString | undefined;
  removeNode?(node: TreeNode);
  onDidChangeSelection?(nodes: TreeNode[]);
  onDidChangeVisibility?(visible: boolean);
}

export function setProvider(provider: TreeProvider) {
  // TODO: run onUnset method of current provider
  currentProvider = provider;
  if (provider.getMessage)
    treeView.message = provider.getMessage();
  onChangeEmitter.fire();
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
    if (!nodes || nodes.length === 0)
      return;
    node = nodes[0];
  }
  return treeView.reveal(node, options);
}

export class StaticTreeNode implements TreeNode {
  constructor(labelOrUri: string | Uri) {
    if (typeof labelOrUri === 'string')
      this.treeItem = new TreeItem(labelOrUri);
    else if (labelOrUri instanceof Uri)
      this.treeItem = new TreeItem(labelOrUri);
  }

  get isRoot() { return this.parent === undefined; }
  get isLeaf() { return this.children.length === 0; }

  addChild(child: StaticTreeNode) {
    log.assert(child.isRoot);
    child.parent_ = this;
    this.children_.push(child);
    this.treeItem.collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
  }

  addChildren(children: StaticTreeNode[]) {
    for (const child of children)
      this.addChild(child);
  }

  sortChildren(cmpFunc?: StaticTreeNode.Compare) {
    StaticTreeNode.sortNodes(this.children_, cmpFunc);
  }

  sortChildrenRecursively(cmpFunc?: StaticTreeNode.Compare) {
    for (const child of this.children)
      child.sortChildrenRecursively(cmpFunc);
    this.sortChildren(cmpFunc);
  }

  remove() {
    const parent = this.parent;
    this.parent_ = undefined;
    if (parent)
      log.assert(removeFirstFromArray(parent.children_, this));
    if (!parent)
      log.assertNonNull(
          log.assertNonNull(currentProvider).removeNode,
          'Static tree provider must provide \'removeNode\' to handle root removal')(
          this);
    onChangeEmitter.fire(parent);
  }

  readonly treeItem: TreeItem;
  get children(): ReadonlyArray<StaticTreeNode> { return this.children_; }
  get parent(): StaticTreeNode | undefined { return this.parent_; }
  allowRemoval() {
    this.treeItem.contextValue = TREE_ITEM_REMOVABLE_CONTEXT ;
  }

  // interface implementation
  getTreeItem() { return this.treeItem; }
  getChildren() { return this.children_; }
  getParent() { return this.parent_; }

  private children_: StaticTreeNode[] = [];
  private parent_?: StaticTreeNode;
}

export namespace StaticTreeNode {
  export type Compare = (a: StaticTreeNode, b: StaticTreeNode) => number;

  export function sortNodes(nodes: StaticTreeNode[], cmpFunc?: Compare) {
    nodes.sort(
        (cmpFunc ||
        ((a, b) =>
              ((a.treeItem.label || '').localeCompare(b.treeItem.label || '')))));
  }

  export function sortNodesRecursively(nodes: StaticTreeNode[], cmpFunc?: Compare)
  {
    for (const node of nodes)
      node.sortChildrenRecursively(cmpFunc);
    sortNodes(nodes, cmpFunc);
  }
}

// private

const onChangeEmitter = new vscode.EventEmitter<TreeNode>();

const treeDataProvider: vscode.TreeDataProvider<TreeNode> = {
  onDidChangeTreeData: onChangeEmitter.event,
  getTreeItem(node: TreeNode) {
    return node.getTreeItem();
  },
  getChildren(node?: TreeNode) {
    if (node)
      return node.getChildren();
    if (currentProvider)
      return currentProvider.getTrees();
    return;
  },
  getParent(node: TreeNode) {
    return node.getParent();
  }
};

function removeNode(...args: any[]) {
  const node = log.assertNonNull(args[0]) as TreeNode;
  const provider = log.assertNonNull(currentProvider);
  if (node instanceof StaticTreeNode)
    node.remove();
  else
    log.assertNonNull(
        provider.removeNode,
        'TreeProvider with removable nodes must provide removeNode method')(
        node);
}

let treeView: vscode.TreeView<TreeNode>;
let currentProvider: TreeProvider | undefined;
