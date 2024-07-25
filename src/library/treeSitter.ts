import Parser from "web-tree-sitter";
import { assert, assertNotNull } from "./exception";
import { readDirectory } from "./fileUtils";
import { AsyncLazy } from "./lazy";
import { log } from "./logging";
import * as nodejs from "./nodejs";
import { perfTimerify } from "./performance";

export type SyntaxNode = Parser.SyntaxNode;
export type SyntaxTree = Parser.Tree;
export type SyntaxTreeEdit = Parser.Edit;

const MAX_PARSE_TIMEOUT_MS = 5000; // 5 seconds

declare module "web-tree-sitter" {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  class SyntaxNode {}
  // eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
  interface SyntaxNode {
    readonly nodeType: SyntaxNode.Type;
    readonly isLeaf: boolean;
    /** For last sibling returns it */
    readonly nextNamedSiblingSafe: SyntaxNode;
    /** For first sibling returns first */
    readonly previousNamedSiblingSafe: SyntaxNode;

    toObject: () => Record<string, unknown>;
    compare: (other: SyntaxNode) => boolean;
  }

  namespace SyntaxNode {
    export type Type =
      | "identifier"
      | "declaration"
      | "function_definition"
      | "decorated_definition"
      | "class_definition"
      | "preproc_include"
      | "system_lib_string"
      | "string_literal"
      | "scoped_identifier"
      | "namespace_identifier"
      | "function_declarator"
      | "number_literal"
      | "type_qualifier"
      | "primitive_type"
      | "type_identifier"
      | "template_type"
      | "scoped_type_identifier"
      | "type_descriptor"
      | "object" // typescript
      | "storage_class_specifier";
  }
}

export namespace TreeSitter {
  export class Language {
    private readonly parser: AsyncLazy<Parser>;

    constructor(private readonly id: string) {
      this.parser = new AsyncLazy(async () => createParser(id));
    }

    get didLoad() {
      return this.parser.didRun;
    }

    get isLoading() {
      return this.parser.isRunning;
    }

    async load() {
      return this.parser.run().ignoreResult();
    }

    parse(
      text: string,
      options?: { prevTree?: SyntaxTree; timeoutMillis?: number },
    ) {
      assert(this.didLoad, `Language "${this.id}" not loaded yet`);
      const parser = this.parser.result;
      const timeoutMs = options?.timeoutMillis ?? MAX_PARSE_TIMEOUT_MS;
      parser.setTimeoutMicros(timeoutMs * 1000);
      const tree = parseTimed(text, parser, options?.prevTree);
      patchSyntaxNodePrototype(tree.rootNode);
      return tree;
    }
  }

  export type Point = Parser.Point;
  export type Range = Parser.Range;

  function assertInitialized() {
    assertNotNull(langRoot);
  }

  /**
   * Tree-Sitter WASM binding create new node on each function/property call so
   * direct comparison is not possible
   */
  export function sameNode(
    node1: SyntaxNode | undefined | null,
    node2: SyntaxNode | undefined | null,
  ) {
    return node1?.id === node2?.id;
  }

  export async function init(mainWasmDir: string, langRootDir: string) {
    await Parser.init({
      locateFile: (scriptName: string, _scriptDirectory: string) =>
        nodejs.path.join(mainWasmDir, scriptName),
    });
    langRoot = langRootDir;
    const langFiles = await readDirectory(langRoot);
    for (const file of langFiles) {
      const id = nodejs.path.parse(file).name;
      languages[id] = new Language(id);
    }
  }

  export function supportedLanguages(): readonly string[] {
    return Object.keys(languages);
  }

  export function languageSupported(id: string) {
    assertInitialized();
    return id in languages;
  }

  export function language(id: string) {
    assert(languageSupported(id), `Language "${id}" not supported`);
    return languages[id];
  }

  export function syntaxNodePrototype(node: Parser.SyntaxNode) {
    return Object.getPrototypeOf(node) as typeof Parser.SyntaxNode.prototype;
  }
}

let langRoot: string | undefined;
const languages: Record<string, TreeSitter.Language> = {};

async function createParser(language: string) {
  const start = Date.now();
  const lang = await Parser.Language.load(
    nodejs.path.join(langRoot!, language + ".wasm"),
  );
  log.info(
    `Loading language "${language}" took ${
      (Date.now() - start) / 1000
    } seconds`,
  );
  const parser = new Parser();
  parser.setLanguage(lang);
  return parser;
}

function treeSitterParse(text: string, parser: Parser, prevTree?: SyntaxTree) {
  try {
    // using TSInput function gives much worse performance
    return parser.parse(text, prevTree);
  } catch (err) {
    throw new Error("TreeSitter: " + String(err));
  }
}

const parseTimed = perfTimerify(treeSitterParse);

function patchSyntaxNodePrototype(node: Parser.SyntaxNode) {
  const prototype = TreeSitter.syntaxNodePrototype(node);

  // without cast to any, TS interprets condition as "always true"
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ("nodeType" in (prototype as any)) return;

  Object.defineProperty(prototype, "nodeType", {
    get() {
      const this_ = this as SyntaxNode;
      return this_.type as Parser.SyntaxNode.Type;
    },
  });

  Object.defineProperty(prototype, "nextNamedSiblingSafe", {
    get(): SyntaxNode {
      const this_ = this as SyntaxNode;
      return this_.nextNamedSibling ?? this_;
    },
  });

  Object.defineProperty(prototype, "previousNamedSiblingSafe", {
    get(): SyntaxNode {
      const this_ = this as SyntaxNode;
      return this_.previousNamedSibling ?? this_;
    },
  });

  Object.defineProperty(prototype, "isLeaf", {
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

  prototype.compare = function (this: SyntaxNode, other: SyntaxNode) {
    return (
      this.text === other.text &&
      this.type === other.type &&
      this.startIndex === other.startIndex &&
      this.endIndex === other.endIndex &&
      this.childCount === other.childCount &&
      this.children.every((child, index) => child.compare(other.child(index)!))
    );
  };
}
