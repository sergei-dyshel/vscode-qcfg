import type { LocationLink, TextDocument } from 'vscode';
import { Location, Range, Uri, workspace } from 'vscode';
import { assertNotNull } from '../../library/exception';
import { offsetPosition } from '../modules/textUtils';

/**
 * Convert Location/LocationLink union, as returned by some functions, to Location
 */
export function resolveLocationLinks(
  locations: Array<Location | LocationLink>,
): Location[] {
  return locations.map((loc) => {
    if ('targetRange' in loc) {
      const range = loc.targetSelectionRange ?? loc.targetRange;
      return new Location(loc.targetUri, range);
    }
    return loc;
  });
}

/**
 * Generate text preview range with some text before and after the range.
 *
 * Produces result similiar to preview texts in Peek dialog.
 * See `FilePreview.preview` in VScode's repo for original algo.
 * If {@param suffixLen} is not specified preview will be until the end of string.
 * @return preview text and offsets of the range inside the preview (usefull for highlights)
 */
export function documentRangePreview(
  document: TextDocument,
  range: Range,
  prefixLen?: number,
  suffixLen?: number,
): [preview: string, start: number, end: number] {
  if (prefixLen === undefined) prefixLen = 8;
  range = document.validateRange(range);
  let { start, end } = range;
  if (suffixLen === undefined) suffixLen = 1000; // some big value
  start = start.withCharacter(Math.max(start.character - prefixLen, 0));
  end = end.translate(undefined /* lineDelta */, suffixLen);
  end = document.validatePosition(end); // adjust line end

  // make sure we don't cut in a middle of a word
  const startWord = document.getWordRangeAtPosition(start);
  if (
    startWord &&
    !startWord.start.isEqual(start) &&
    !startWord.end.isEqual(start)
  )
    start = startWord.start;
  const endWord = document.getWordRangeAtPosition(end);
  if (endWord && !endWord.end.isEqual(end) && !endWord.end.isEqual(end))
    end = endWord.end;

  const prefix = document.getText(new Range(start, range.start)).trimStart();
  const suffix = document.getText(new Range(range.end, end)).trimEnd();
  const text = document.getText(range);
  return [prefix + text + suffix, prefix.length, prefix.length + text.length];
}

/**
 * Search for substring in document's range and return corresponding subrange.
 */
export function findTextInRange(
  document: TextDocument,
  text: string,
  range: Range,
): Range {
  const fulltext = document.getText(range);
  const startOffset = fulltext.search(text);
  const start = offsetPosition(document, range.start, startOffset);
  const end = offsetPosition(document, start, text.length);
  return new Range(start, end);
}

export function getDocumentRoot(fileName: string) {
  const workspaceFolder = workspace.getWorkspaceFolder(Uri.file(fileName));
  if (!workspaceFolder) return;
  const relativePath = workspace.asRelativePath(fileName, false);
  return { workspaceFolder, relativePath };
}

export function getDocumentRootThrowing(fileName: string) {
  const root = getDocumentRoot(fileName);
  assertNotNull(root, `Could not get workspace folder of ${fileName}`);
  return root;
}

export function getDocumentWorkspaceFolder(fileName: string) {
  const docRoot = getDocumentRoot(fileName);
  return docRoot ? docRoot.workspaceFolder : undefined;
}
