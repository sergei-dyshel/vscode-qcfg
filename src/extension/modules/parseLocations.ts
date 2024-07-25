import "../../library/stringPrototype";

import type { TextDocument, WorkspaceFolder } from "vscode";
import { Location, Position, Range, Uri, workspace } from "vscode";
import * as nodejs from "../../library/nodejs";
import { concatArrays, filterNonNull } from "../../library/tsUtils";
import { mapAsync } from "./async";
import { Subprocess } from "./subprocess";
import { offsetPosition } from "./textUtils";

const VIMGREP_PARSE_REGEX =
  /^(?<file>.+?):(?<line>\d+)(:(?<column>\d+))?(: (?<text>.*))?$/;

/* gtags line has whitespace-trimmed text so we can't use to for tag searching */
const GTAGS_PARSE_REGEX =
  /(?<tag>\S+)\s+(?<line>\d+)\s+(?<file>\S+) (?<text>.*)/;

export enum ParseLocationFormat {
  VIMGREP,
  GTAGS,
}

export function parseLocations(
  text: string,
  base: string,
  format: ParseLocationFormat,
): Location[] {
  const lines = text.match(/[^\n\r]+/g);
  if (!lines) return [];
  return filterNonNull(lines.map((line) => parseLocation(line, base, format)));
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
  line: string,
  base: string,
  format: ParseLocationFormat,
): Location | undefined {
  const regex = formatToRegex(format);
  const match = regex.exec(line);
  if (!match) return;
  const groups = match.groups!;
  if (!groups["file"]) return;
  const column = !groups["column"] ? 1 : Number(groups["column"]);
  return new Location(
    Uri.file(nodejs.path.resolve(base, groups["file"])),
    new Position(Number(groups["line"]) - 1, column - 1),
  );
}

/**
 * Find pattern in given range and return match range
 */
export function findInRange(
  document: TextDocument,
  range: Range,
  pattern: RegExp | string,
): Range | undefined {
  const text = document.getText(range);
  const match = text.searchFirst(pattern);
  if (!match) return;

  const [start, length] = match;
  return new Range(
    offsetPosition(document, range.start, start),
    offsetPosition(document, range.start, start + length),
  );
}

/**
 * If parsed location is only a position, try to expand it to non-empty range by
 * searching the tag inside
 */
export function adjustRangeInParsedPosition(
  document: TextDocument,
  position: Position,
  pattern: string | RegExp,
): Range {
  const line = document.lineAt(position);
  const range = findInRange(document, line.range, pattern);
  if (range) return range;

  if (line.isEmptyOrWhitespace) return line.range.start.asRange;

  if (!document.getWordRangeAtPosition(position)) {
    const firstNonWS = line.range.start.withCharacter(
      line.firstNonWhitespaceCharacterIndex,
    );
    return firstNonWS.asRange;
  }
  return position.asRange;
}

export async function findPatternInParsedLocations(
  locations: Location[],
  pattern: string | RegExp,
): Promise<Location[]> {
  return mapAsync(locations, async (loc) => {
    if (!loc.range.isEmpty) return loc;
    const doc = await workspace.openTextDocument(loc.uri);
    const range = adjustRangeInParsedPosition(doc, loc.range.start, pattern);
    return new Location(doc.uri, range);
  });
}

export async function gatherLocationsFromFolder(
  cmd: string,
  folder: WorkspaceFolder,
  format: ParseLocationFormat,
): Promise<Location[]> {
  const subproc = new Subprocess(cmd, {
    cwd: folder.uri.fsPath,
    allowedCodes: [0, 1],
  });
  const res = await subproc.wait();
  if (res.code === 0)
    return parseLocations(res.stdout, folder.uri.fsPath, format);
  return [];
}

export async function gatherLocationsFromWorkspace(
  cmd: string,
  format: ParseLocationFormat,
): Promise<Location[]> {
  const locations = await Promise.all(
    workspace.workspaceFolders!.map(async (folder) =>
      gatherLocationsFromFolder(cmd, folder, format),
    ),
  );
  return concatArrays<Location>(...locations);
}
