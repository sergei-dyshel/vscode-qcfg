'use strict';

import * as vscode from 'vscode';
import { StaticTreeNode, TreeProvider } from "./treeView";
import * as treeView from './treeView';
import { Location, Uri } from "vscode";
import { MultiDictionary } from "typescript-collections";
import { filterNonNull, removeFirstFromArray } from './tsUtils';
import * as path from 'path';
import { Logger, str } from './logging';

const log = Logger.create('locationTree');

const DEFAULT_PARSE_REGEX =
    /^(?<file>.+?):(?<line>\d+):((?<column>\d+):)? (?<text>.*$)/;

export interface ParsedLocation {
  location: Location;
  text?: string;
}

export function parseLocations(text: string, base?: string): ParsedLocation[]
{
  const lines = text.match(/[^\r\n]+/g);
  if (!lines)
    return [];
  return filterNonNull(lines.map(line => parseLocation(line, base)));
}

export function parseLocation(line: string, base?: string): ParsedLocation|
    undefined {
  const match = line.match(DEFAULT_PARSE_REGEX);
  if (!match)
    return;
  const groups = match.groups!;
  if (!groups.file)
      return;
  const location = new Location(
      Uri.file(path.resolve(base || '', groups.file)),
      new vscode.Position(
          Number(groups.line) - 1, Number(groups.column || 1) - 1));
  const text = groups.text ? groups.text : "";
  return {location, text};
}

export function setLocations(
    message: string, parsedLocations: ParsedLocation[], reveal = true) {
  const dict = new MultiDictionary<Uri, ParsedLocation>();
  const fileNodes: FileNode[] = [];
  for (const parsedLoc of parsedLocations)
    dict.setValue(parsedLoc.location.uri, parsedLoc);
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
      return a.location.range.start.line - b.location.range.start.line;
    if (a instanceof DirNode && b instanceof FileNode)
      return -1;
    if (a instanceof FileNode && b instanceof DirNode)
      return 1;
    return a.treeItem.resourceUri!.fsPath.localeCompare(
        b.treeItem.resourceUri!.fsPath);
  });
  currentTrees = nodes;
  currentMessage = message;
  treeView.setProvider(provider);
  if (reveal)
    treeView.revealTree(undefined, {select: false, focus: false});
}

// private

namespace TreeBuilder {
  type Tree = FileNode | Forest;
  interface Forest extends Map<string, Tree> {}

  function createForest() { return new Map<string, Tree>(); }

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
    else if (tree instanceof Map) {
      insert(tree, components, file);
      return;
    } else {
      throw Error();
    }
  }

  export function buildDirHierarchy(files: FileNode[]): StaticTreeNode[] {
    const forest = build(files);
    compress(forest);
    return convertToHierarchy(forest, "");
  }

  function build(files: FileNode[]): Forest {
    const forest = createForest();
    for (const file of files) {
      const components = file.treeItem.resourceUri!.fsPath.split(path.sep);
      if (components[0] === '')
        components.shift();
      insert(forest, components, file);
    }
    return forest;
  }

  function compress(forest: Forest) {
    for (const entry of forest) {
      const [comp, tree] = entry;
      if (!(tree instanceof Map))
        continue;
      compress(tree);
      if (tree.size > 1)
        continue;
      const [subcomp, subtree] = tree.entries().next().value;
      if (!(subtree instanceof Map))
        continue;
      forest.delete(comp);
      forest.set(path.join(comp, subcomp), subtree);
    }
  }

  function convertToHierarchy(forest: Forest, prefix: string): StaticTreeNode[] {
    const nodes: StaticTreeNode[] = [];
    for (let [subpath, tree] of forest) {
      if (tree instanceof FileNode)
        nodes.push(tree);
      else if (tree instanceof Map) {
        if (prefix === "")
          subpath = path.sep + subpath;
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

class DirNode extends StaticTreeNode {
  constructor(dir: string, label: string) {
    super(label);
    const uri = Uri.file(dir);
    this.treeItem.resourceUri = uri;
    this.treeItem.iconPath = vscode.ThemeIcon.Folder;
    this.treeItem.label = label;
    this.treeItem.id = uri.fsPath;
    this.allowRemoval();
  }
}

class FileNode extends StaticTreeNode {
  constructor(uri: Uri) {
    super("");
    this.treeItem.resourceUri = uri;
    this.treeItem.iconPath = vscode.ThemeIcon.File;
    this.allowRemoval();
    this.treeItem.id = uri.fsPath;
  }
}

class LocationNode extends StaticTreeNode {
  constructor(parsedLoc: ParsedLocation) {
    const text = log.assertNonNull(parsedLoc.text);
    const trimOffset = text.length - text.trimLeft().length;
    super(log.assertNonNull(text.trim()));
    this.location = parsedLoc.location;
    this.allowRemoval();
    this.treeItem.id = str(this.location);
    const label = this.treeItem.label as vscode.TreeItemLabel;
    label.highlights = [[
      this.location.range.start.character - trimOffset,
      this.location.range.end.character - trimOffset
    ]];
  }
  show() {
    vscode.window.showTextDocument(
        this.location.uri, {selection: this.location.range});
  }
  location: Location;
}

const provider: TreeProvider = {
  getTrees() {
    return currentTrees;
  },
  getMessage() {
    return currentMessage;
  },
  removeNode(node: StaticTreeNode) {
    log.assert(node.isRoot);
    log.assert(removeFirstFromArray(log.assertNonNull(currentTrees), node));
  },
  onDidChangeSelection(nodes: StaticTreeNode[]) {
    if (nodes.length !== 1)
      return;
    const node = nodes[0];
    if (node instanceof LocationNode)
      node.show();
  }
};

let currentTrees: StaticTreeNode[]|undefined;
let currentMessage = "";