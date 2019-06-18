'use strict';

import { TextBuffer } from 'superstring';
import * as Parser from 'tree-sitter';
import { SyntaxNode, Tree as SyntaxTree } from 'tree-sitter';
import * as treeSitterCpp from 'tree-sitter-cpp';
import * as treeSitterPython from 'tree-sitter-python';
import * as treeSitterTypeScript from 'tree-sitter-typescript';
import { ExtensionContext, Position, Range, TextDocument, TextDocumentChangeEvent, workspace, window } from 'vscode';
import { NumRange } from './documentUtils';
import { listenWrapped } from './exception';
import { Modules } from './module';
import { Timer } from './nodeUtils';
import { DefaultMap } from './tsUtils';
import { PromiseContext } from './async';
import { Logger } from './logging';
import * as nodejs from './nodejs';

type VsRange = Range;

const UPDATE_DELAY_MS = 100;

export { SyntaxNode, SyntaxTree };

interface LanguageConfig {
  parser: any;
}

declare module 'tree-sitter' {
  class SyntaxNode {

  }
  interface SyntaxNode {
    readonly offsetRange: NumRange;
    readonly range: VsRange;
    readonly start: Position;
    readonly end: Position;
  }
}

Object.defineProperty(SyntaxNode.prototype, 'offsetRange', {
  get(): NumRange {
    const this_ = this as SyntaxNode;
    /* XXX: use memoization package? (e.g. memoizee) */
    if (!this.offsetRange_)
      this.offsetRange_ = new NumRange(this_.startIndex, this_.endIndex);
    return this.offsetRange_;
  }
});

Object.defineProperty(SyntaxNode.prototype, 'range', {
  get(): Range {
    const this_ = this as SyntaxNode;
    if (!this.range_)
      this.range_ = new Range(this_.start, this_.end);
    return this.range_;
  }
});

Object.defineProperty(SyntaxNode.prototype, 'start', {
  get(): Position {
    const this_ = this as SyntaxNode;
    if (!this.start_)
      this.start_ =
          new Position(this_.startPosition.row, this_.startPosition.column);
    return this.start_;
  }
});

Object.defineProperty(SyntaxNode.prototype, 'end', {
  get(): Position {
    const this_ = this as SyntaxNode;
    if (!this.end_)
      this.end_ = new Position(this_.endPosition.row, this_.endPosition.column);
    return this.end_;
  }
});

namespace Parsers {
  const parserPool = new DefaultMap<string, Parser[]>(() => []);

  export function get(language: string): Parser {
    if (!(language in languageConfig))
      throw new Error(`Syntax tree not available for language "${language}"`);
    const parsers = parserPool.get(language);
    if (parsers.notEmpty)
      return parsers.pop()!;
    const parser = new Parser.default();
    parser.setLanguage(languageConfig[language].parser);
    return parser;
  }

  export function put(language: string, parser: Parser) {
    parserPool.get(language).push(parser);
  }
}

const languageConfig: {[language: string]: LanguageConfig} = {
  python: {parser: treeSitterPython},
  c: {parser: treeSitterCpp},
  cpp: {parser: treeSitterCpp},
  typescript: {parser: treeSitterTypeScript},
};


class DocumentContext {
  constructor(private document: TextDocument) {
    this.log =
        new Logger({instance: nodejs.path.parse(document.fileName).name});
  }
  private tree?: SyntaxTree;
  private promiseContext?: PromiseContext<SyntaxTree>;
  private timer: Timer = new Timer();
  private generation = 0;
  private log: Logger;
  private isUpdating = false;

  async update() {
    if (this.isUpdating)
      return;
    const parser = Parsers.get(this.document.languageId);
    const parserAsync = parser as any as ParserWithAsync;
    const buf = new TextBuffer(this.document.getText());
    this.isUpdating = true;
    while (true) {
      const generation = this.generation;
      try {
        // TODO: make using previous tree configurable (may crash)
        const start = Date.now();
        this.tree = await parserAsync.parseTextBuffer(
            buf, this.tree, {syncOperationCount: 1000});
        const end = Date.now();
        this.log.debug(`Parsing took ${(end - start) / 1000} seconds`);
        if (generation === this.generation) {
          if (this.promiseContext) {
            this.promiseContext.resolve(this.tree);
            this.promiseContext = undefined;
          }
          break;
        }
      }
      catch (err) {
        this.log.error(err);
        this.tree = undefined;
        if (this.promiseContext)
          this.promiseContext.reject(err);
        this.promiseContext = undefined;
        break;
      }
    }
    Parsers.put(this.document.languageId, parser);
    this.isUpdating = false;
  }

  onDocumentUpdated() {
    this.timer.setTimeout(UPDATE_DELAY_MS, this.update);
  }

  async get(): Promise<SyntaxTree> {
    if (this.timer.isSet || this.isUpdating) {
      if (!this.promiseContext)
        this.promiseContext = new PromiseContext();
      return this.promiseContext.promise;
    }
    if (this.tree)
      return this.tree;
    this.promiseContext = new PromiseContext();
    this.update();
    return this.promiseContext.promise;
  }
}

const trees = new DefaultMap<TextDocument, DocumentContext>(
    (document) => new DocumentContext(document));

export namespace SyntaxTrees {
  export function get(document: TextDocument): Promise<SyntaxTree> {
    if (SyntaxTrees.supportedLanguages.includes(document.languageId))
        return trees.get(document).get();
    throw new Error(
        `Syntax tree not available for language "${document.languageId}"`);
  }

  export const supportedLanguages = Object.keys(languageConfig);
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const document = event.document;
  if ((window.activeTextEditor &&
       window.activeTextEditor.document === document &&
       SyntaxTrees.supportedLanguages.includes(document.languageId)) ||
      trees.has(document))
    trees.get(document).update();
}

// parseTextBuffer is missing in tree-sitter definitions
interface ParserWithAsync {
  parseTextBuffer(buf: TextBuffer, oldTree?: SyntaxTree, config?: {
    syncOperationCount: number
  }): Promise<SyntaxTree>;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(
          workspace.onDidCloseTextDocument, document => trees.delete(document)),
      listenWrapped(
          workspace.onDidChangeTextDocument, onDidChangeTextDocument));
}

Modules.register(activate);
