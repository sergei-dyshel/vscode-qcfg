'use strict';

import * as path from 'path';
import { MultiDictionary } from 'typescript-collections';
import * as vscode from 'vscode';
import { Location, Uri } from 'vscode';
import {
  adjustOffsetRangeAfterChange,
  NumRange,
  offsetToRange,
  rangeToOffset
} from './documentUtils';
import { listenWrapped } from './exception';
import { log, str } from './logging';
import { isSubPath } from './pathUtils';
import { StaticTreeNode, TreeProvider, QcfgTreeView } from './treeView';
import { Modules } from './module';
import { ParsedLocation } from './parseLocations';

export function setLocations(
  message: string,
  parsedLocations: ParsedLocation[],
  reveal = true
) {
  const dict = new MultiDictionary<Uri, ParsedLocation>();
  const fileNodes: FileNode[] = [];
  for (const parsedLoc of parsedLocations)
    dict.setValue(parsedLoc.uri, parsedLoc);
  for (const uri of dict.keys()) {
    const fileNode = new FileNode(uri);
    fileNodes.push(fileNode);
    for (const parsedLoc of dict.getValue(uri)) {
      const locNode = new LocationNode(parsedLoc);
      fileNode.addChild(locNode);
    }
  }
  const nodes = TreeBuilder.buildDirHierarchy(fileNodes);
  StaticTreeNode.sortNodesRecursively(nodes, (a, b) => {
    if (a instanceof LocationNode && b instanceof LocationNode)
      return a.line - b.line;
    if (a instanceof DirNode && b instanceof FileNode) return -1;
    if (a instanceof FileNode && b instanceof DirNode) return 1;
    return log
      .assertInstanceOf(a, UriNode)
      .fsPath.localeCompare(log.assertInstanceOf(b, UriNode).fsPath);
  });
  currentTrees = nodes;
  currentMessage = message;
  QcfgTreeView.setProvider(provider);
  if (reveal)
    QcfgTreeView.revealTree(undefined, { select: false, focus: false });
}

// private

namespace TreeBuilder {
  type Tree = FileNode | Forest;
  interface Forest extends Map<string, Tree> {}

  function createForest() {
    return new Map<string, Tree>();
  }

  function insert(forest: Forest, components: string[], file: FileNode) {
    if (components.length === 1) {
      forest.set(components[0], file);
      return;
    }
    const comp = components.shift()!;
    const tree = forest.get(comp);
    if (tree === undefined) {
      const subforest = createForest();
      forest.set(comp, subforest);
      insert(subforest, components, file);
      return;
    } else if (tree instanceof Map) {
      insert(tree, components, file);
      return;
    } else {
      throw Error();
    }
  }

  export function buildDirHierarchy(files: FileNode[]): StaticTreeNode[] {
    const forest = build(files);
    compress(forest);
    return convertToHierarchy(forest, '');
  }

  function build(files: FileNode[]): Forest {
    const forest = createForest();
    for (const file of files) {
      const components = file.fsPath.split(path.sep);
      if (components[0] === '') components.shift();
      insert(forest, components, file);
    }
    return forest;
  }

  function compress(forest: Forest) {
    for (const entry of forest) {
      const [comp, tree] = entry;
      if (!(tree instanceof Map)) continue;
      compress(tree);
      if (tree.size > 1) continue;
      const [subcomp, subtree] = tree.entries().next().value;
      if (!(subtree instanceof Map)) continue;
      forest.delete(comp);
      forest.set(path.join(comp, subcomp), subtree);
    }
  }

  function convertToHierarchy(
    forest: Forest,
    prefix: string
  ): StaticTreeNode[] {
    const nodes: StaticTreeNode[] = [];
    for (let [subpath, tree] of forest) {
      if (tree instanceof FileNode) nodes.push(tree);
      else if (tree instanceof Map) {
        if (prefix === '') subpath = path.sep + subpath;
        const newPrefix = path.join(prefix, subpath);
        const dirNode = new DirNode(newPrefix, subpath);
        dirNode.addChildren(convertToHierarchy(tree, newPrefix));
        nodes.push(dirNode);
      } else {
        throw Error();
      }
    }
    return nodes;
  }
}

class UriNode extends StaticTreeNode {
  constructor(uri: Uri, label: string) {
    super(label);
    this.treeItem.resourceUri = uri;
    this.treeItem.id = uri.fsPath;
    this.allowRemoval();
  }

  get uri() {
    return this.treeItem.resourceUri!;
  }
  get fsPath() {
    return this.uri.fsPath;
  }
}

class DirNode extends UriNode {
  constructor(dir: string, label: string) {
    const uri = Uri.file(dir);
    super(uri, label);
    this.treeItem.iconPath = vscode.ThemeIcon.Folder;
    this.treeItem.label = label;
    this.setExpanded();
  }
}

class FileNode extends UriNode {
  constructor(uri: Uri) {
    super(uri, '');
    this.treeItem.iconPath = vscode.ThemeIcon.File;
    this.setExpanded();
  }
}

class LocationNode extends StaticTreeNode {
  constructor(parsedLoc: ParsedLocation) {
    const text = log.assertNonNull(parsedLoc.text);
    const trimOffset = text.length - text.trimLeft().length;
    super(log.assertNonNull(text.trim()));
    this.uri = parsedLoc.uri;
    this.allowRemoval();
    this.treeItem.id = str(parsedLoc);
    const label = this.treeItem.label as vscode.TreeItemLabel;
    this.line = parsedLoc.range.start.line;
    label.highlights = [
      [
        parsedLoc.range.start.character - trimOffset,
        parsedLoc.range.end.character - trimOffset
      ]
    ];
    this.fetchDocument(parsedLoc);
  }
  async show() {
    const document = await vscode.workspace.openTextDocument(this.uri);
    const selection = offsetToRange(
      document,
      log.assertNonNull(this.offsetRange)
    );
    vscode.window.showTextDocument(this.uri, { selection });
  }
  private async fetchDocument(location: Location) {
    const document = await vscode.workspace.openTextDocument(this.uri);
    this.offsetRange = rangeToOffset(document, location.range);
  }
  line: number;
  uri: Uri;
  offsetRange?: NumRange;
}

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
  const document = event.document;
  if (!currentTrees || !QcfgTreeView.isCurrentProvider(provider)) return;
  StaticTreeNode.applyRecursively(currentTrees, node => {
    if (node instanceof DirNode && isSubPath(node.fsPath, document.fileName))
      return true;
    if (node instanceof FileNode && node.fsPath === document.uri.fsPath)
      return true;
    if (node instanceof LocationNode)
      node.offsetRange = adjustOffsetRangeAfterChange(
        log.assertNonNull(node.offsetRange),
        event.contentChanges
      );
    return false;
  });
}

const provider: TreeProvider = {
  getTrees() {
    return currentTrees;
  },
  getMessage() {
    return currentMessage;
  },
  removeNode(node: StaticTreeNode) {
    if (node.isRoot) log.assert(currentTrees!.removeFirst(node));
    node.remove();
  },
  onDidChangeSelection(nodes: StaticTreeNode[]) {
    if (nodes.length !== 1) return;
    const node = nodes[0];
    if (node instanceof LocationNode) node.show();
  }
};

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(
      vscode.workspace.onDidChangeTextDocument,
      onDidChangeTextDocument
    )
  );
}

Modules.register(activate);

let currentTrees: StaticTreeNode[] | undefined;
let currentMessage = '';
