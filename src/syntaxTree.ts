'use strict';

import { TextBuffer } from 'superstring';
import * as Parser from 'tree-sitter';
// tslint:disable-next-line: no-duplicate-imports
import { SyntaxNode, Tree as SyntaxTree } from 'tree-sitter';
import {
  Event,
  EventEmitter,
  ExtensionContext,
  Position,
  Range,
  TextDocument,
  TextDocumentChangeEvent,
  window,
  workspace
} from 'vscode';
import { PromiseContext } from './async';
import { NumRange } from './documentUtils';
import { listenWrapped, handleAsyncStd } from './exception';
import { Logger } from './logging';
import { Modules } from './module';
import * as nodejs from './nodejs';
import { Timer } from './nodeUtils';
import { DefaultMap } from './tsUtils';

type VsRange = Range;

const UPDATE_DELAY_MS = 100;

export { SyntaxNode, SyntaxTree };

interface LanguageConfig {
  parser: any;
}

const languageConfig: { [language: string]: LanguageConfig } = {
  python: { parser: require('tree-sitter-python') },
  c: { parser: require('tree-sitter-c') },
  cpp: { parser: require('tree-sitter-cpp') },
  typescript: { parser: require('tree-sitter-typescript') },
  shellscript: { parser: require('tree-sitter-bash') },
  go: { parser: require('tree-sitter-go') },
  lua: { parser: require('tree-sitter-lua') }
};

declare module 'tree-sitter' {
  class SyntaxNode {}
  interface SyntaxNode {
    readonly nodeType: SyntaxNode.Type;
    readonly offsetRange: NumRange;
    readonly range: VsRange;
    readonly start: Position;
    readonly end: Position;
  }
  namespace SyntaxNode {
    export type Type =
      | 'identifier'
      | 'declaration'
      | 'function_definition'
      | 'decorated_definition'
      | 'class_definition'
      | 'preproc_include'
      | 'system_lib_string'
      | 'string_literal'
      | 'scoped_identifier'
      | 'namespace_identifier'
      | 'function_declarator'
      | 'number_literal'
      | 'type_qualifier'
      | 'primitive_type'
      | 'type_identifier'
      | 'template_type'
      | 'scoped_type_identifier'
      | 'type_descriptor'
      | 'object' // typescript
      | 'storage_class_specifier';
  }
}

export namespace SyntaxTrees {
  export function get(document: TextDocument): Promise<SyntaxTree> {
    checkDocumentSupported(document);
    return trees.get(document).get();
  }
  export function isDocumentSupported(document: TextDocument) {
    return document.languageId in languageConfig;
  }

  export function documentGeneration(document: TextDocument) {
    checkDocumentSupported(document);
    return trees.get(document).generation;
  }

  export const supportedLanguages = Object.keys(languageConfig);
}

export interface SyntaxTreeUpdatedEvent {
  document: TextDocument;
  tree: SyntaxTree;
}

const emmiter = new EventEmitter<SyntaxTreeUpdatedEvent>();
export const onSyntaxTreeUpdated: Event<SyntaxTreeUpdatedEvent> = emmiter.event;

//////////////////////////////////////////////////////////////////////////////
// Private
//////////////////////////////////////////////////////////////////////////////

Object.defineProperty(SyntaxNode.prototype, 'nodeType', {
  get(): SyntaxNode.Type {
    const this_ = this as SyntaxNode;
    return this_.type as SyntaxNode.Type;
  }
});

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
    if (!this.range_) this.range_ = new Range(this_.start, this_.end);
    return this.range_;
  }
});

Object.defineProperty(SyntaxNode.prototype, 'start', {
  get(): Position {
    const this_ = this as SyntaxNode;
    if (!this.start_)
      this.start_ = new Position(
        this_.startPosition.row,
        this_.startPosition.column
      );
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
    if (!parsers.isEmpty) return parsers.pop()!;
    const parser = new Parser.default();
    parser.setLanguage(languageConfig[language].parser);
    return parser;
  }

  export function put(language: string, parser: Parser) {
    parserPool.get(language).push(parser);
  }
}

class DocumentContext {
  constructor(private document: TextDocument) {
    this.log = new Logger({
      instance: nodejs.path.parse(document.fileName).name
    });
  }
  private tree?: SyntaxTree;
  private promiseContext?: PromiseContext<SyntaxTree>;
  private timer: Timer = new Timer();
  private generation_ = 0;
  private log: Logger;
  private isUpdating = false;

  async update() {
    if (this.isUpdating) return;
    const parser = Parsers.get(this.document.languageId);
    const parserAsync = (parser as any) as ParserWithAsync;
    const buf = new TextBuffer(this.document.getText());
    this.isUpdating = true;
    while (true) {
      const generation = this.generation_;
      try {
        // TODO: make using previous tree configurable (may crash)
        const start = Date.now();
        this.tree = await parserAsync.parseTextBuffer(buf, this.tree, {
          syncOperationCount: 1000
        });
        const end = Date.now();
        this.log.debug(`Parsing took ${(end - start) / 1000} seconds`);
        if (generation === this.generation_) {
          emmiter.fire({ document: this.document, tree: this.tree });
          if (this.promiseContext) {
            this.promiseContext.resolve(this.tree);
            this.promiseContext = undefined;
          }
          break;
        }
      } catch (err) {
        this.log.error(err);
        this.tree = undefined;
        if (this.promiseContext) this.promiseContext.reject(err);
        this.promiseContext = undefined;
        break;
      }
    }
    Parsers.put(this.document.languageId, parser);
    this.isUpdating = false;
  }

  get generation() {
    return this.generation_;
  }

  onDocumentUpdated() {
    this.timer.setTimeout(UPDATE_DELAY_MS, this.update);
  }

  async get(): Promise<SyntaxTree> {
    if (this.timer.isSet || this.isUpdating) {
      if (!this.promiseContext) this.promiseContext = new PromiseContext();
      return this.promiseContext.promise;
    }
    if (this.tree) return this.tree;
    this.promiseContext = new PromiseContext();
    // tslint:disable-next-line: no-floating-promises
    this.update();
    return this.promiseContext.promise;
  }
}

const trees = new DefaultMap<TextDocument, DocumentContext>(
  document => new DocumentContext(document)
);

function checkDocumentSupported(document: TextDocument) {
  if (!SyntaxTrees.isDocumentSupported(document))
    throw new Error(
      `Syntax tree not available for language "${document.languageId}"`
    );
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  const document = event.document;
  if (
    (window.activeTextEditor &&
      window.activeTextEditor.document === document &&
      SyntaxTrees.supportedLanguages.includes(document.languageId)) ||
    trees.has(document)
  )
    handleAsyncStd(trees.get(document).update());
}

// parseTextBuffer is missing in tree-sitter definitions
interface ParserWithAsync {
  parseTextBuffer(
    buf: TextBuffer,
    oldTree?: SyntaxTree,
    config?: {
      syncOperationCount: number;
    }
  ): Promise<SyntaxTree>;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidCloseTextDocument, document =>
      trees.delete(document)
    ),
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument)
  );
}

Modules.register(activate);
