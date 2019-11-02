'use strict';

import {
  TextDocument,
  Range,
  Position,
  ExtensionContext,
  workspace,
  TextDocumentChangeEvent,
  Location
} from 'vscode';
import { DisposableLike } from './utils';
import { TextDocumentContentChangeEvent } from 'vscode';
import { DefaultMap } from './tsUtils';
import { offsetToRange, NumRange } from './documentUtils';
import { Modules } from './module';
import { listenWrapped } from './exception';

abstract class LiveLocation extends Location implements DisposableLike {
  private registered_ = false;
  private valid_ = true;

  constructor(
    document: TextDocument,
    range: Range,
    private onInvalidated?: () => void
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
    change: TextDocumentContentChangeEvent
  ): boolean;
}

export class LivePosition extends LiveLocation {
  private offset: number;

  constructor(
    document: TextDocument,
    position: Position,
    onInvalidated?: () => void
  ) {
    super(document, position.asRange, onInvalidated);
    this.offset = document.offsetAt(position);
  }

  adjust(
    document: TextDocument,
    change: TextDocumentContentChangeEvent
  ): boolean {
    const newOffset = adjustOffsetAfterChange(this.offset, change);
    if (newOffset) {
      this.offset = newOffset;
      this.range = document.positionAt(this.offset).asRange;
      return true;
    } else {
      this.invalidate();
      return false;
    }
  }
}

export class LiveRange extends LiveLocation {
  private start: number;
  private end: number;
  private mergeOnReplace: boolean;

  constructor(
    document: TextDocument,
    range: Range,
    opts: {
      mergeOnReplace: boolean;
      onInvalidated?: () => void;
    }
  ) {
    super(
      document,
      range,
      opts && opts.onInvalidated ? opts.onInvalidated : undefined
    );
    if (range.isEmpty) throw new Error('LiveRange range must be non-empty');
    this.start = document.offsetAt(range.start);
    this.end = document.offsetAt(range.end);
    this.mergeOnReplace = opts && opts.mergeOnReplace;
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
    change: TextDocumentContentChangeEvent
  ): boolean {
    this.start = adjustOffsetAfterChange(
      this.start,
      change,
      false /* not end */,
      this.mergeOnReplace
    )!;
    this.end = adjustOffsetAfterChange(
      this.end,
      change,
      true /* is end */,
      this.mergeOnReplace
    )!;
    if (this.start < this.end) {
      this.range = offsetToRange(document, new NumRange(this.start, this.end));
      return true;
    }
    this.invalidate();
    return false;
  }
}

export function adjustOffsetAfterChange(
  offset: number,
  change: TextDocumentContentChangeEvent,
  isEnd = false,
  mergeOnReplace = false
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
  else return changeStart;
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
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument)
  );
}

Modules.register(activate);
