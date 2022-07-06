'use strict';

import type {
  ExtensionContext,
  Position,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentContentChangeEvent,
  TextEditor,
} from 'vscode';
import { Location, workspace } from 'vscode';
import type { DisposableLike } from '../../library/disposable';
import { assert } from '../../library/exception';
import { DefaultMap } from '../../library/tsUtils';
import { NumRange, offsetToRange } from './documentUtils';
import { listenWrapped } from './exception';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';

export abstract class LiveLocation extends Location implements DisposableLike {
  private registered = false;
  private valid = true;

  private onInvalidated?: () => void;
  protected mergeOnReplace = false;

  constructor(document: TextDocument, range: Range) {
    super(document.uri, range);
  }

  /** Create LiveRange/LivePosition depending on range emptiness */
  static fromDocument(document: TextDocument, range: Range): LiveLocation {
    if (range.isEmpty) return new LivePosition(document, range.start);
    return new LiveRange(document, range);
  }

  static async fromLocation(location: Location) {
    return LiveLocation.fromDocument(
      await workspace.openTextDocument(location.uri),
      location.range,
    );
  }

  /**
   * Register live location to be ajusted on text document changes.
   *
   * `onInvalidated` - caalled when location was (partially) overwritten
   * by edit operation and is not longer valid.
   *
   * `mergeOnReplace` - when part of location range is replaced,
   * merge replaced text in instead of cutting
   */
  register(onInvalidated: () => void, mergeOnReplace = false) {
    assert(!this.registered, 'Already registered');
    assert(this.valid, 'Can not register an invalid LiveLocation');
    this.registered = true;
    this.onInvalidated = onInvalidated;
    this.mergeOnReplace = mergeOnReplace;
    allLocations.get(this.uri.fsPath).push(this);
  }

  get asPosition(): LivePosition {
    assert(this instanceof LivePosition);
    return this as LivePosition;
  }

  get isRegistered() {
    return this.registered;
  }

  unregister() {
    if (!this.isRegistered) return;
    this.registered = false;
    allLocations.get(this.uri.fsPath).removeFirst(this);
  }

  dispose() {
    this.unregister();
  }

  get isValid() {
    return this.valid;
  }

  protected invalidate() {
    if (!this.valid)
      throw new Error('Can not invalidate already invalid LiveLocation');
    this.valid = false;
    this.registered = false;
    this.onInvalidated!();
  }

  /**
   * Return true if adjusted properly, false if invalidated and needs to be
   * unregistered
   */
  abstract adjust(
    document: TextDocument,
    change: TextDocumentContentChangeEvent,
  ): boolean;
}

export class LivePosition extends LiveLocation {
  private offset: number;

  constructor(document: TextDocument, position: Position) {
    super(document, position.asRange);
    this.offset = document.offsetAt(position);
  }

  get position(): Position {
    return this.range.start;
  }

  static fromEditor(editor: TextEditor): LivePosition {
    const document = editor.document;
    const pos = editor.selection.active.with();
    return new LivePosition(document, pos);
  }

  static fromActiveEditor(): LivePosition {
    return LivePosition.fromEditor(getActiveTextEditor());
  }

  adjust(
    document: TextDocument,
    change: TextDocumentContentChangeEvent,
  ): boolean {
    const newOffset = adjustOffsetAfterChange(this.offset, change);
    if (newOffset) {
      this.offset = newOffset;
      this.range = document.positionAt(this.offset).asRange;
      return true;
    }
    this.invalidate();
    return false;
  }
}

export class LiveRange extends LiveLocation {
  private start: number;
  private end: number;

  constructor(document: TextDocument, range: Range) {
    super(document, range);
    if (range.isEmpty) throw new Error('LiveRange range must be non-empty');
    this.start = document.offsetAt(range.start);
    this.end = document.offsetAt(range.end);
  }

  get startOffset(): number {
    return this.start;
  }

  get endOffset(): number {
    return this.end;
  }

  get offsetRange() {
    return new NumRange(this.startOffset, this.endOffset);
  }

  adjust(
    document: TextDocument,
    change: TextDocumentContentChangeEvent,
  ): boolean {
    this.start = adjustOffsetAfterChange(
      this.start,
      change,
      false /* not end */,
      this.mergeOnReplace,
    )!;
    this.end = adjustOffsetAfterChange(
      this.end,
      change,
      true /* is end */,
      this.mergeOnReplace,
    )!;
    if (this.start < this.end) {
      this.range = offsetToRange(document, new NumRange(this.start, this.end));
      return true;
    }
    this.invalidate();
    return false;
  }
}

export class LiveLocationArray implements DisposableLike {
  private array: LiveLocation[] = [];

  push(liveLoc: LiveLocation) {
    liveLoc.register(() => {
      this.array.removeFirst(liveLoc);
    });
    this.array.push(liveLoc);
  }

  pop(): LiveLocation | undefined {
    const popped = this.array.pop();
    if (popped) {
      popped.unregister();
    }
    return popped;
  }

  get top(): LiveLocation | undefined {
    return this.array.top;
  }

  unshift(liveLoc: LiveLocation) {
    liveLoc.register(() => {
      this.array.removeFirst(liveLoc);
    });
    this.array.unshift(liveLoc);
  }

  shift(): LiveLocation | undefined {
    const shifted = this.array.shift();
    if (shifted) {
      shifted.unregister();
    }
    return shifted;
  }

  locations(): readonly Location[] {
    return this.array;
  }

  clear() {
    this.array.forEach((loc) => {
      loc.unregister();
    });
    this.array = [];
  }

  dispose() {
    this.clear();
  }

  get length() {
    return this.locations.length;
  }
}

// Private

function adjustOffsetAfterChange(
  offset: number,
  change: TextDocumentContentChangeEvent,
  isEnd = false,
  mergeOnReplace = false,
): number | undefined {
  const changeStart = change.rangeOffset;
  const changeEnd = change.rangeOffset + change.rangeLength;
  const delta = change.text.length - change.rangeLength;
  if (changeStart > offset) return offset;
  if (changeStart === offset) {
    if (changeEnd === offset) {
      // text inserted exactly at offset, check align option
      if (isEnd === mergeOnReplace) return offset + delta;
      return offset;
    }
    // text modified/deleted right after offset
    return offset;
  }
  if (changeEnd <= offset) {
    // text modified/deleted before offset
    return offset + delta;
  }
  // text replaced around offset
  if (!mergeOnReplace) return undefined;
  if (isEnd) return changeEnd + delta;
  // is Start
  return changeStart;
}

const allLocations = new DefaultMap<string, LiveLocation[]>(() => []);

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const document = event.document;
  const changes = event.contentChanges;
  if (document.fileName.startsWith('extension-output')) return;
  // TODO: exit if no changes for current document
  // make sure changes are sorted in descending order by offset
  for (const [x, y] of changes.pairIter()) {
    if (y.rangeOffset + y.rangeLength > x.rangeOffset)
      throw new Error('TextDocumentChange-s are not sorted properly');
  }
  if (!allLocations.has(document.fileName)) return;
  const locations = allLocations.get(document.fileName);
  locations.forEachRight((loc, index) => {
    for (const change of changes) {
      const valid = loc.adjust(document, change);
      if (!valid) {
        locations.splice(index, 1);
        break;
      }
    }
  });
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
  );
}

Modules.register(activate);
