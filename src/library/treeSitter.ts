import * as nodejs from './nodejs';
import Parser from 'web-tree-sitter';
import { readDirectory } from './fileUtils';
import { assert, assertNotNull } from './exception';
import { perfTimerify } from './performance';

export type SyntaxNode = Parser.SyntaxNode;
export type SyntaxTree = Parser.Tree;

const MAX_PARSE_TIMEOUT_MS = 5000; // 5 seconds

declare module 'web-tree-sitter' {
  class SyntaxNode {}
  interface SyntaxNode {
    readonly nodeType: SyntaxNode.Type;
    readonly isLeaf: boolean;
    /** For last sibling returns it */
    readonly nextNamedSiblingSafe: SyntaxNode;
    /** For first sibling returns first */
    readonly previousNamedSiblingSafe: SyntaxNode;

    toObject: () => Record<string, unknown>;
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

export namespace TreeSitter {
  let langRoot: string | undefined;
  const parsers: Record<string, Parser | Promise<void> | undefined> = {};
  let languages: string[] = [];

  export type Point = Parser.Point;
  export type Range = Parser.Range;

  function assertInitialized() {
    assertNotNull(langRoot);
  }

  /**
   * Tree-Sitter WASM binding create new node on each function/property call
   * so direct comparison is not possible
   */
  export function sameNode(
    node1: SyntaxNode | undefined | null,
    node2: SyntaxNode | undefined | null,
  ) {
    return node1?.id === node2?.id;
  }

  export async function init(mainWasmDir: string, langRootDir: string) {
    langRoot = langRootDir;
    const langFiles = await readDirectory(langRoot);
    languages = langFiles.map((file) => nodejs.path.parse(file).name);
    await Parser.init({
      locateFile: (scriptName: string, _scriptDirectory: string) =>
        nodejs.path.join(mainWasmDir, scriptName),
    });
  }

  function assertSupported(language: string) {
    assert(languageSupported(language), `Language ${language} not supported`);
  }

  export function supportedLanguages(): readonly string[] {
    return languages;
  }

  export function languageSupported(language: string) {
    assertInitialized();
    return supportedLanguages().includes(language);
  }

  export function languageLoaded(language: string) {
    assertSupported(language);
    const parser = parsers[language];
    return parser && !(parser instanceof Promise);
  }

  export async function loadLanguage(language: string) {
    assertSupported(language);
    if (languageLoaded(language)) return;
    const curParser = parsers[language];
    if (curParser instanceof Promise) return curParser;
    if (curParser) return;
    const lang = await Parser.Language.load(
      nodejs.path.join(langRoot!, language + '.wasm'),
    );
    const parser = new Parser();
    parser.setLanguage(lang);
    parsers[language] = parser;
  }

  export function syntaxNodePrototype(node: Parser.SyntaxNode) {
    return Object.getPrototypeOf(node) as typeof Parser.SyntaxNode.prototype;
  }

  function treeSitterParse(
    text: string,
    parser: Parser,
    prevTree?: SyntaxTree,
  ) {
    try {
      return parser.parse(text, prevTree);
    } catch (err) {
      throw new Error('TreeSitter: ' + String(err));
    }
  }

  const parseTimed = perfTimerify(treeSitterParse);

  export function parse(
    text: string,
    language: string,
    options?: { prevTree?: SyntaxTree; timeoutMillis?: number },
  ) {
    assert(languageLoaded(language), `Language ${language} not loaded`);
    const parser = parsers[language] as Parser;
    const timeoutMs = options?.timeoutMillis ?? MAX_PARSE_TIMEOUT_MS;
    parser.setTimeoutMicros(timeoutMs * 1000);
    const tree = parseTimed(text, parser, options?.prevTree);
    patchSyntaxNodePrototype(tree.rootNode);
    return tree;
  }

  function patchSyntaxNodePrototype(node: Parser.SyntaxNode) {
    const prototype = syntaxNodePrototype(node);

    // without cast to any, TS interprets condition as "always true"
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ('nodeType' in (prototype as any)) return;

    Object.defineProperty(prototype, 'nodeType', {
      get() {
        const this_ = this as SyntaxNode;
        return this_.type as Parser.SyntaxNode.Type;
      },
    });

    Object.defineProperty(prototype, 'nextNamedSiblingSafe', {
      get(): SyntaxNode {
        const this_ = this as SyntaxNode;
        return this_.nextNamedSibling ?? this_;
      },
    });

    Object.defineProperty(prototype, 'previousNamedSiblingSafe', {
      get(): SyntaxNode {
        const this_ = this as SyntaxNode;
        return this_.previousNamedSibling ?? this_;
      },
    });

    Object.defineProperty(prototype, 'isLeaf', {
      get(): boolean {
        const this_ = this as SyntaxNode;
        return this_.childCount === 0;
      },
    });

    prototype.toObject = function (this: SyntaxNode) {
      const range = `[${this.startPosition.row}, ${this.startPosition.column}] - [${this.endPosition.row}, ${this.endPosition.column}]`;
      return {
        type: this.type,
        range,
        children: this.namedChildren.map((child) => child.toObject()),
      };
    };
  }
}
