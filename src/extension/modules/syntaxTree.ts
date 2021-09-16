'use strict';

// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import type {
  Event,
  ExtensionContext,
  TextDocument,
  TextDocumentChangeEvent,
} from 'vscode';
import { EventEmitter, Position, Range, window, workspace } from 'vscode';
import { PromiseContext } from './async';
import { NumRange } from './documentUtils';
import { listenWrapped, handleAsyncStd, handleStd } from './exception';
import { Logger } from '../../library/logging';
import { Modules } from './module';
import * as nodejs from '../../library/nodejs';
import { Timer } from '../../library/nodeUtils';
import { DefaultMap } from '../../library/tsUtils';
import type { SyntaxTree } from '../../library/syntax';
import { SyntaxLanguage, SyntaxNode } from '../../library/syntax';

type VsRange = Range;

const UPDATE_DELAY_MS = 100;

declare module 'tree-sitter' {
  interface SyntaxNode {
    readonly offsetRange: NumRange;
    readonly range: VsRange;
    readonly start: Position;
    readonly end: Position;
  }
}

export namespace SyntaxTrees {
  export async function get(document: TextDocument): Promise<SyntaxTree> {
    checkDocumentSupported(document);
    return trees.get(document).get();
  }
  export function isDocumentSupported(document: TextDocument) {
    return SyntaxLanguage.isSupported(document.languageId);
  }
}

export interface SyntaxTreeUpdatedEvent {
  document: TextDocument;
  tree: SyntaxTree;
}

const emmiter = new EventEmitter<SyntaxTreeUpdatedEvent>();
export const onSyntaxTreeUpdated: Event<SyntaxTreeUpdatedEvent> = emmiter.event;

//
// Private
//

Object.defineProperty(SyntaxNode.prototype, 'offsetRange', {
  get(): NumRange {
    const this_ = this as SyntaxNode;
    /* XXX: use memoization package? (e.g. memoizee) */
    if (!this.offsetRange_)
      this.offsetRange_ = new NumRange(this_.startIndex, this_.endIndex);
    return this.offsetRange_;
  },
});

Object.defineProperty(SyntaxNode.prototype, 'range', {
  get(): Range {
    const this_ = this as SyntaxNode;
    if (!this.range_) this.range_ = new Range(this_.start, this_.end);
    return this.range_;
  },
});

Object.defineProperty(SyntaxNode.prototype, 'start', {
  get(): Position {
    const this_ = this as SyntaxNode;
    if (!this.start_)
      this.start_ = new Position(
        this_.startPosition.row,
        this_.startPosition.column,
      );
    return this.start_;
  },
});

Object.defineProperty(SyntaxNode.prototype, 'end', {
  get(): Position {
    const this_ = this as SyntaxNode;
    if (!this.end_)
      this.end_ = new Position(this_.endPosition.row, this_.endPosition.column);
    return this.end_;
  },
});

class DocumentContext {
  constructor(private readonly document: TextDocument) {
    this.log = new Logger({
      instance: nodejs.path.parse(document.fileName).name,
    });
  }

  private tree?: SyntaxTree;
  private promiseContext?: PromiseContext<SyntaxTree>;
  private readonly timer: Timer = new Timer();
  private readonly log: Logger;
  private isUpdating = false;

  async update() {
    if (this.isUpdating) return;
    this.isUpdating = true;
    for (;;) {
      try {
        const version = this.document.version;
        // TODO: make using previous tree configurable (may crash)
        const start = Date.now();
        this.tree = await SyntaxLanguage.get(this.document.languageId).parse(
          this.document.getText(),
        );
        const end = Date.now();
        this.log.debug(
          `Parsing took ${(end - start) / 1000} seconds (version ${version})`,
        );
        if (version === this.document.version) {
          this.tree.version = version;
          emmiter.fire({ document: this.document, tree: this.tree });
          if (this.promiseContext) {
            this.promiseContext.resolve(this.tree);
            this.promiseContext = undefined;
          }
          break;
        }
      } catch (err: unknown) {
        this.log.error(err);
        this.tree = undefined;
        if (this.promiseContext) this.promiseContext.reject(err as Error);
        this.promiseContext = undefined;
        this.isUpdating = false;
        throw err;
      }
    }
    this.isUpdating = false;
  }

  onDocumentUpdated() {
    this.timer.setTimeout(UPDATE_DELAY_MS, () => {
      handleStd(async () => this.update());
    });
  }

  invalidate() {
    this.tree = undefined;
  }

  async get(): Promise<SyntaxTree> {
    if (this.timer.isSet || this.isUpdating) {
      if (!this.promiseContext) this.promiseContext = new PromiseContext();
      return this.promiseContext.promise;
    }
    if (this.tree) return this.tree;
    this.promiseContext = new PromiseContext();
    handleStd(async () => this.update());
    return this.promiseContext.promise;
  }
}

const trees = new DefaultMap<TextDocument, DocumentContext>(
  (document) => new DocumentContext(document),
);

function checkDocumentSupported(document: TextDocument) {
  if (!SyntaxTrees.isDocumentSupported(document))
    throw new Error(
      `Syntax tree not available for language "${document.languageId}"`,
    );
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const document = event.document;
  if (
    (window.activeTextEditor &&
      window.activeTextEditor.document === document &&
      SyntaxTrees.isDocumentSupported(document)) ||
    trees.has(document)
  )
    handleAsyncStd(trees.get(document).update());
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidCloseTextDocument, (document) => {
      trees.delete(document);
    }),
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
  );
}

Modules.register(activate);
