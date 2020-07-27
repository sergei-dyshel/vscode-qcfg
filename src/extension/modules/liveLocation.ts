'use strict';

import {
  ExtensionContext,
  Position,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  TextDocumentContentChangeEvent,
  workspace,
  Location,
} from 'vscode';
import { NumRange, offsetToRange } from './documentUtils';
import { listenWrapped } from './exception';
import { Modules } from './module';
import { DefaultMap } from '../../library/tsUtils';
import { DisposableLike } from '../../library/types';

export abstract class LiveLocation extends Location implements DisposableLike {
  private registered_ = false;
  private valid_ = true;

  constructor(
    document: TextDocument,
    range: Range,
    /** Called when location was (partially) overwritten
     * by edit operation and is not longer valid
     */
    private readonly onInvalidated?: () => void,
  ) {
    super(document.uri, range);
  }

  register() {
    if (this.registered_) throw new Error('Already registered');
    if (!this.valid_)
      throw new Error('Can not register an invalid LiveLocation');
    this.registered_ = true;
    allLocations.get(this.uri.fsPath).push(this);
  }

  get isRegistered() {
    return this.registered_;
  }

  unregister() {
    if (!this.isRegistered) return;
    this.registered_ = false;
    allLocations.get(this.uri.fsPath).removeFirst(this);
  }

  dispose() {
    this.unregister();
  }

  get isValid() {
    return this.valid_;
  }

  protected invalidate() {
    if (!this.valid_)
      throw new Error('Can not invalidate already invalid LiveLocation');
    this.valid_ = false;
    this.registered_ = false;
    if (this.onInvalidated) this.onInvalidated();
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

  constructor(
    document: TextDocument,
    position: Position,
    onInvalidated?: () => void,
  ) {
    super(document, position.asRange, onInvalidated);
    this.offset = document.offsetAt(position);
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
  private readonly mergeOnReplace: boolean;

  constructor(
    document: TextDocument,
    range: Range,
    opts: {
      mergeOnReplace?: boolean;
      onInvalidated?: () => void;
    },
  ) {
    super(document, range, opts.onInvalidated);
    if (range.isEmpty) throw new Error('LiveRange range must be non-empty');
    this.start = document.offsetAt(range.start);
    this.end = document.offsetAt(range.end);
    this.mergeOnReplace = opts.mergeOnReplace ?? false;
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

/** Create LiveRange/LivePosition depending on range emptiness */
export function createLiveLocation(
  document: TextDocument,
  range: Range,
  opts: {
    mergeOnReplace?: boolean;
    onInvalidated?: () => void;
  },
): LiveLocation {
  if (range.isEmpty)
    return new LivePosition(document, range.start, opts.onInvalidated);
  return new LiveRange(document, range, opts);
}

export async function createLiveLocationAsync(
  location: Location,
  opts: {
    mergeOnReplace?: boolean;
    onInvalidated?: () => void;
  },
) {
  return createLiveLocation(
    await workspace.openTextDocument(location.uri),
    location.range,
    opts,
  );
}

export class LiveLocationArray implements DisposableLike {
  private array: LiveLocation[] = [];

  add(document: TextDocument, range: Range, mergeOnReplace?: boolean) {
    let liveLoc = createLiveLocation(document, range, {
      mergeOnReplace,
      onInvalidated: () => {
        this.array.removeFirst(liveLoc);
      },
    });
    this.array.push(liveLoc);
  }

  async addAsync(location: Location, mergeOnReplace?: boolean) {
    this.add(
      await workspace.openTextDocument(location.uri),
      location.range,
      mergeOnReplace,
    );
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
