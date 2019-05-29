'use strict';

import * as vscode from 'vscode';
import { TreeItem, ProviderResult, Uri } from 'vscode';
import { callIfNonNull } from './tsUtils';
import { Logger } from './logging';

const log = Logger.create('treeView');

export function activate(context: vscode.ExtensionContext) {
  const opts: vscode.TreeViewOptions<TreeNode> = {
    showCollapseAll: true,
    'treeDataProvider': treeDataProvider
  };
  treeView = vscode.window.createTreeView('qcfgTreeView', opts);
  context.subscriptions.push(
      treeView,
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
  onDidChangeSelection?(nodes: TreeNode[]);
  onDidChangeVisibility?(visible: boolean);
}

export function setProvider(provider: TreeProvider) {
  // TODO: run onUnset method of current provider
  currentProvider = provider;
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

  readonly treeItem: TreeItem;
  get children(): ReadonlyArray<StaticTreeNode> { return this.children_; }
  get parent(): StaticTreeNode | undefined { return this.parent_; }

  // interface implementation
  getTreeItem() { return this.treeItem; }
  getChildren() { return this.children_; }
  getParent() { return this.parent_; }

  private children_: StaticTreeNode[] = [];
  private parent_?: StaticTreeNode;
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

let treeView: vscode.TreeView<TreeNode>;
let currentProvider: TreeProvider | undefined;
