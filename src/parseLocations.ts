'use strict';

import { Uri, Position, Location, WorkspaceFolder, workspace } from "vscode";
import { filterNonNull, concatArrays } from "./tsUtils";
import * as nodejs from './nodejs';
import { Subprocess } from "./subprocess";

const DEFAULT_PARSE_REGEX =
    /^(?<file>.+?):(?<line>\d+):((?<column>\d+):)? (?<text>.*$)/;

export interface ParsedLocation {
  location: Location;
  text?: string;
}

export function parseLocations(text: string, base?: string): ParsedLocation[] {
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
      Uri.file(nodejs.path.resolve(base || '', groups.file)),
      new Position(
          Number(groups.line) - 1, Number(groups.column || 1) - 1));
  const text = groups.text ? groups.text : "";
  return {location, text};
  return;
}

export async function gatherLocationsFromFolder(
    cmd: string, folder: WorkspaceFolder): Promise<ParsedLocation[]> {
  const subproc =
      new Subprocess(cmd, {cwd: folder.uri.fsPath, allowedCodes: [0, 1]});
  const res = await subproc.wait();
  if (res.code === 0)
    return parseLocations(res.stdout, folder.uri.fsPath);
  return [];
}

export async function gatherLocationsFromWorkspace(cmd: string):
    Promise<ParsedLocation[]> {
  const locations = await Promise.all(workspace.workspaceFolders!.map(
      folder => gatherLocationsFromFolder(cmd, folder)));
  return concatArrays<ParsedLocation>(...locations);
}