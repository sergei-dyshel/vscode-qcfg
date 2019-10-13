'use strict';

import { Uri, Position, Location, WorkspaceFolder, workspace } from "vscode";
import { filterNonNull, concatArrays } from "./tsUtils";
import * as nodejs from './nodejs';
import { Subprocess } from "./subprocess";

const VIMGREP_PARSE_REGEX =
    /^(?<file>.+?):(?<line>\d+)(:(?<column>\d+))?(: (?<text>.*))?$/;


/* gtags line has whitespace-trimmed text so we can't use to for tag searching */
const GTAGS_PARSE_REGEX =
    /(?<tag>\S+)\s+(?<line>[0-9]+)\s+(?<file>\S+) (?<text>.*)/;

export enum ParseLocationFormat {
  VIMGREP,
  GTAGS
}

export interface ParsedLocation {
  location: Location;
  text?: string;
}

export function parseLocations(
    text: string, base: string, format: ParseLocationFormat): ParsedLocation[] {
  const lines = text.match(/[^\r\n]+/g);
  if (!lines)
    return [];
  return filterNonNull(lines.map(line => parseLocation(line, base, format)));
}

function formatToRegex(format: ParseLocationFormat): RegExp {
  switch (format) {
    case ParseLocationFormat.VIMGREP:
      return VIMGREP_PARSE_REGEX;
    case ParseLocationFormat.GTAGS:
      return GTAGS_PARSE_REGEX;
  }
}

export function parseLocation(
    line: string, base: string, format: ParseLocationFormat): ParsedLocation|undefined {
  const regex = formatToRegex(format);
  const match = line.match(regex);
  if (!match)
    return;
  const groups = match.groups!;
  if (!groups.file)
      return;
  let column = 1;
  if (!groups.column) {
    column = 1;
  } else {
    column = Number(groups.column);
  }
  const location = new Location(
      Uri.file(nodejs.path.resolve(base || '', groups.file)),
      new Position(Number(groups.line) - 1, column - 1));
  const text = groups.text ? groups.text : "";
  return {location, text};
}

export async function gatherLocationsFromFolder(
    cmd: string, folder: WorkspaceFolder,
    format: ParseLocationFormat): Promise<ParsedLocation[]> {
  const subproc =
      new Subprocess(cmd, {cwd: folder.uri.fsPath, allowedCodes: [0, 1]});
  const res = await subproc.wait();
  if (res.code === 0)
    return parseLocations(res.stdout, folder.uri.fsPath, format);
  return [];
}

export async function gatherLocationsFromWorkspace(
    cmd: string, format: ParseLocationFormat): Promise<ParsedLocation[]> {
  const locations = await Promise.all(workspace.workspaceFolders!.map(
      folder => gatherLocationsFromFolder(cmd, folder, format)));
  return concatArrays<ParsedLocation>(...locations);
}