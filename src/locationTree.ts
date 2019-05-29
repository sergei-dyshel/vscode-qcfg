'use strict';

import * as vscode from 'vscode';
import { StaticTreeNode, TreeProvider } from "./treeView";
import * as treeView from './treeView';
import { Location, Uri } from "vscode";
import { MultiDictionary } from "typescript-collections";
import { filterNonNull } from './tsUtils';
import * as path from 'path';

const DEFAULT_PARSE_REGEX =
    /^(?<file>.+?):(?<line>\d+):((?<column>\d+):)?(?<text>.*$)/;

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
  const text = groups.text ? groups.text.trim() : "";
  return {location, text};
}

export function setLocations(parsedLocations: ParsedLocation[], reveal = true) {
  const dict = new MultiDictionary<Uri, ParsedLocation>();
  currentTrees = [];
  for (const parsedLoc of parsedLocations)
    dict.setValue(parsedLoc.location.uri, parsedLoc);
  for (const uri of dict.keys()) {
    const fileNode = new FileNode(uri);
    currentTrees.push(fileNode);
    fileNode.treeItem.iconPath = vscode.ThemeIcon.File;
    for (const parsedLoc of dict.getValue(uri)) {
      const locNode = new LocationNode(parsedLoc);
      fileNode.addChild(locNode);
    }
  }
  treeView.setProvider(provider);
  if (reveal)
    treeView.revealTree(undefined, {select: false, focus: false});
}

// private

class FileNode extends StaticTreeNode {
  constructor(uri: Uri) {
    super(uri);
  }
}

class LocationNode extends StaticTreeNode {
  constructor(parsedLoc: ParsedLocation) {
    super(parsedLoc.text || "");
    this.location = parsedLoc.location;
  }
  show() {
    vscode.window.showTextDocument(
        this.location.uri, {selection: this.location.range});
  }
  private location: Location;
}

const provider: TreeProvider = {
  getTrees() {
    return currentTrees;
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