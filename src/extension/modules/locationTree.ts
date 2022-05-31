'use strict';

import { MultiDictionary } from 'typescript-collections';
import type { ExtensionContext, Location, TextDocument } from 'vscode';
import { ThemeIcon, Uri, window, workspace } from 'vscode';
import { assert, assertInstanceOf } from '../../library/exception';
import * as nodejs from '../../library/nodejs';
import { stringify as str } from '../../library/stringify';
import { maxNumber } from '../../library/tsUtils';
import { mapSomeAsyncAndZip } from './async';
import { handleAsyncStd } from './exception';
import { LiveLocation } from './liveLocation';
import { Modules } from './module';
import type { TreeNode, TreeProvider } from './treeView';
import { QcfgTreeView, StaticTreeNode } from './treeView';

/** Populate location side panel with given locations */
export async function setPanelLocations(
  message: string,
  locations: readonly Location[],
  reveal = true,
) {
  currentTrees = await nodesFromLocations(locations, { setId: true });
  currentMessage = message;
  QcfgTreeView.setProvider(locationTreeProvider);
  if (reveal)
    await QcfgTreeView.revealTree(undefined, { select: false, focus: false });
}

export type LocationGroup = [label: string, locations: Location[]];

/** Populate location side panel with named groups of locations */
export async function setPanelLocationGroups(
  message: string,
  groups: LocationGroup[],
  reveal = true,
) {
  const nodes: StaticTreeNode[] = [];
  for (const group of groups) {
    const node = new StaticTreeNode(group[0]);
    node.addChildren(await nodesFromLocations(group[1], { setId: false }));
    nodes.push(node);
  }
  currentTrees = nodes;
  currentMessage = message;
  QcfgTreeView.setProvider(locationTreeProvider);
  if (reveal)
    await QcfgTreeView.revealTree(undefined, { select: false, focus: false });
}

// private

/** Options for creating location tree nodes */
interface LocationTreeOptions {
  /**
   * Set file/directory/location node ID.
   *
   * Should be false there is going to be multiple nodes for same file/dir/loc,
   * e.g. multiple location groups.
   */
  setId?: boolean;
}

async function nodesFromLocations(
  locations: readonly Location[],
  options: LocationTreeOptions,
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
    const fileNode = new FileNode(uri, options);
    fileNodes.push(fileNode);
    for (const loc of dict.getValue(uri)) {
      const locNode = new LocationNode(loc, documents.get(uri)!, options);
      fileNode.addChild(locNode);
    }
  }
  const nodes = TreeBuilder.buildDirHierarchy(fileNodes, options);
  StaticTreeNode.sortNodesRecursively(nodes, (a, b) => {
    if (a instanceof LocationNode && b instanceof LocationNode)
      return a.line - b.line;
    if (a instanceof DirNode && b instanceof FileNode) return -1;
    if (a instanceof FileNode && b instanceof DirNode) return 1;
    return assertInstanceOf(a, UriNode).fsPath.localeCompare(
      assertInstanceOf(b, UriNode).fsPath,
    );
  });
  return nodes;
}

namespace TreeBuilder {
  type Tree = FileNode | Forest;
  type Forest = Map<string, Tree>;

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

  export function buildDirHierarchy(
    files: FileNode[],
    options: LocationTreeOptions,
  ): StaticTreeNode[] {
    const forest = build(files);
    compress(forest);
    return convertToHierarchy(forest, '', options).map((root) => {
      root.provider = locationTreeProvider;
      return root;
    });
  }

  function build(files: FileNode[]): Forest {
    const forest = createForest();
    for (const file of files) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const components = file.fsPath.split(nodejs.path.sep);
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
      forest.set(nodejs.path.join(comp, subcomp as string), subtree);
    }
  }

  function convertToHierarchy(
    forest: Forest,
    prefix: string,
    options: LocationTreeOptions,
  ): StaticTreeNode[] {
    const nodes: StaticTreeNode[] = [];
    for (const [subpath, tree] of forest) {
      if (tree instanceof FileNode) nodes.push(tree);
      else {
        const absSubpath = prefix === '' ? nodejs.path.sep + subpath : subpath;
        const newPrefix = nodejs.path.join(prefix, absSubpath);
        const dirNode = new DirNode(newPrefix, absSubpath, options);
        dirNode.addChildren(convertToHierarchy(tree, newPrefix, options));
        nodes.push(dirNode);
      }
    }
    return nodes;
  }
}

class UriNode extends StaticTreeNode {
  constructor(uri: Uri, label: string, options: LocationTreeOptions) {
    super(label);
    this.treeItem.resourceUri = uri;
    if (options.setId) this.treeItem.id = uri.fsPath;
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
  constructor(dir: string, label: string, options: LocationTreeOptions) {
    const uri = Uri.file(dir);
    super(uri, label, options);
    this.treeItem.iconPath = ThemeIcon.Folder;
    this.treeItem.label = label;
    this.setExpanded();
  }
}

class FileNode extends UriNode {
  constructor(uri: Uri, options: LocationTreeOptions) {
    super(uri, '', options);
    this.treeItem.iconPath = ThemeIcon.File;
    this.setExpanded();
  }
}

class LocationNode extends StaticTreeNode {
  constructor(
    loc: Location,
    document: TextDocument,
    options: LocationTreeOptions,
  ) {
    const start = loc.range.start;
    const docLine = document.lineAt(start.line);
    const text = docLine.text;
    const trimOffset = docLine.firstNonWhitespaceCharacterIndex;
    const label = text.substring(trimOffset);
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
    if (options.setId) this.treeItem.id = str(loc);
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
  onDidChangeSelection(nodes_: readonly TreeNode[]) {
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
