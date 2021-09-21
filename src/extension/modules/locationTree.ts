'use strict';

import * as path from 'path';
import { MultiDictionary } from 'typescript-collections';
import type { ExtensionContext, Location, TextDocument } from 'vscode';
import { ThemeIcon, Uri, window, workspace } from 'vscode';
import { assert, assertInstanceOf } from '../../library/exception';
import { stringify as str } from '../../library/stringify';
import { maxNumber } from '../../library/tsUtils';
import { mapSomeAsyncAndZip } from './async';
import { handleAsyncStd } from './exception';
import { LiveLocation } from './liveLocation';
import { Modules } from './module';
import type { TreeNode, TreeProvider } from './treeView';
import { QcfgTreeView, StaticTreeNode } from './treeView';

export async function setPanelLocations(
  message: string,
  locations: readonly Location[],
  reveal = true,
) {
  const dict = new MultiDictionary<Uri, Location>();
  const fileNodes: FileNode[] = [];
  for (const loc of locations) dict.setValue(loc.uri, loc);
  const documents = new Map<Uri, TextDocument>(
    await mapSomeAsyncAndZip(dict.keys(), (uri) =>
      workspace.openTextDocument(uri),
    ),
  );
  for (const uri of dict.keys()) {
    const fileNode = new FileNode(uri);
    fileNodes.push(fileNode);
    for (const loc of dict.getValue(uri)) {
      const locNode = new LocationNode(loc, documents.get(uri)!);
      fileNode.addChild(locNode);
    }
  }
  const nodes = TreeBuilder.buildDirHierarchy(fileNodes);
  StaticTreeNode.sortNodesRecursively(nodes, (a, b) => {
    if (a instanceof LocationNode && b instanceof LocationNode)
      return a.line - b.line;
    if (a instanceof DirNode && b instanceof FileNode) return -1;
    if (a instanceof FileNode && b instanceof DirNode) return 1;
    return assertInstanceOf(a, UriNode).fsPath.localeCompare(
      assertInstanceOf(b, UriNode).fsPath,
    );
  });
  currentTrees = nodes;
  currentMessage = message;
  QcfgTreeView.setProvider(locationTreeProvider);
  if (reveal)
    await QcfgTreeView.revealTree(undefined, { select: false, focus: false });
}

// private

namespace TreeBuilder {
  type Tree = FileNode | Forest;
  // use interface to prevent circular reference
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
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
    }
    if (tree instanceof Map) {
      insert(tree, components, file);
      return;
    }
    throw Error();
  }

  export function buildDirHierarchy(files: FileNode[]): StaticTreeNode[] {
    const forest = build(files);
    compress(forest);
    return convertToHierarchy(forest, '').map((root) => {
      root.provider = locationTreeProvider;
      return root;
    });
  }

  function build(files: FileNode[]): Forest {
    const forest = createForest();
    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const [subcomp, subtree] = tree.entries().next().value;
      if (!(subtree instanceof Map)) continue;
      forest.delete(comp);
      forest.set(path.join(comp, subcomp as string), subtree);
    }
  }

  function convertToHierarchy(
    forest: Forest,
    prefix: string,
  ): StaticTreeNode[] {
    const nodes: StaticTreeNode[] = [];
    for (const [subpath, tree] of forest) {
      if (tree instanceof FileNode) nodes.push(tree);
      else if (tree instanceof Map) {
        const absSubpath = prefix === '' ? path.sep + subpath : subpath;
        const newPrefix = path.join(prefix, absSubpath);
        const dirNode = new DirNode(newPrefix, absSubpath);
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
    this.treeItem.iconPath = ThemeIcon.Folder;
    this.treeItem.label = label;
    this.setExpanded();
  }
}

class FileNode extends UriNode {
  constructor(uri: Uri) {
    super(uri, '');
    this.treeItem.iconPath = ThemeIcon.File;
    this.setExpanded();
  }
}

class LocationNode extends StaticTreeNode {
  constructor(loc: Location, document: TextDocument) {
    const start = loc.range.start;
    const docLine = document.lineAt(start.line);
    const text = docLine.text;
    const trimOffset = docLine.firstNonWhitespaceCharacterIndex;
    const label = text.substr(trimOffset);
    if (start.isEqual(loc.range.end)) {
      // empty range
      super(label);
    } else {
      super({
        label,
        highlights: [
          [
            maxNumber(0, loc.range.start.character - trimOffset),
            maxNumber(0, loc.range.end.character - trimOffset),
          ],
        ],
      });
    }
    /* TODO: use createLiveLocationAsync */
    this.location = LiveLocation.fromDocument(document, loc.range);
    this.location.register(() => {
      this.remove();
    }, true /* mergeOnReplace */);
    this.allowRemoval();
    this.treeItem.id = str(loc);
  }

  async show() {
    await window.showTextDocument(this.location.uri, {
      selection: this.location.range,
    });
  }

  get line() {
    return this.location.range.start.line;
  }

  location: LiveLocation;
}

const locationTreeProvider: TreeProvider = {
  getTrees() {
    return currentTrees;
  },
  getMessage() {
    return currentMessage;
  },
  removeNode(node_: TreeNode) {
    const node = node_ as StaticTreeNode;
    if (node.isRoot) {
      assert(currentTrees!.removeFirst(node));
      QcfgTreeView.treeChanged();
      return;
    }
    node.remove();
  },
  onDidChangeSelection(nodes_: TreeNode[]) {
    const nodes = nodes_ as StaticTreeNode[];
    if (nodes.length !== 1) return;
    const node = nodes[0];
    if (node instanceof LocationNode) {
      handleAsyncStd(node.show());
    }
  },
  onUnset() {
    if (!currentTrees) return;
    currentTrees.forEach((root) => {
      root.applyRecursively((node) => {
        if (!(node instanceof LocationNode)) return true;
        node.location.unregister();
        return true;
      });
    });
  },
};

function activate(_: ExtensionContext) {
  // TODO: remove if unused
}

Modules.register(activate);

let currentTrees: StaticTreeNode[] | undefined;
let currentMessage = '';
