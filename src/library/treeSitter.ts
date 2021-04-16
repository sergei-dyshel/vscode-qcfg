'use strict';

import { TextBuffer } from 'superstring';
import { SyntaxNode, Tree as SyntaxTree } from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import * as SyntaxParser from 'tree-sitter';

export { SyntaxNode, SyntaxTree, TextBuffer, SyntaxParser };

interface SyntaxConfig {
  parser: unknown;
}

/** Workaround about not being able to export default import */
export function newSyntaxParser() {
  return new SyntaxParser.default();
}

export const syntaxLanguages: Record<string, SyntaxConfig | undefined> = {
  python: { parser: require('tree-sitter-python') },
  c: { parser: require('tree-sitter-c') },
  cpp: { parser: require('tree-sitter-cpp') },
  typescript: { parser: require('tree-sitter-typescript/typescript') },
  shellscript: { parser: require('tree-sitter-bash') },
  go: { parser: require('tree-sitter-go') },
  lua: { parser: require('tree-sitter-lua') },
};

declare module 'tree-sitter' {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  class SyntaxNode {}
  interface SyntaxNode {
    readonly nodeType: SyntaxNode.Type;
    readonly isLeaf: boolean;
    /** For last sibling returns it */
    readonly nextNamedSiblingSafe: SyntaxNode;
    /** For first sibling returns first */
    readonly previousNamedSiblingSafe: SyntaxNode;
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

  // eslint-disable-next-line no-shadow
  class Tree {}
  interface Tree {
    version: number;
  }
}

Object.defineProperty(SyntaxNode.prototype, 'nodeType', {
  get(): SyntaxNode.Type {
    const this_ = this as SyntaxNode;
    return this_.type as SyntaxNode.Type;
  },
});

Object.defineProperty(SyntaxNode.prototype, 'nextNamedSiblingSafe', {
  get(): SyntaxNode {
    const this_ = this as SyntaxNode;
    return this_.nextNamedSibling ?? this_;
  },
});

Object.defineProperty(SyntaxNode.prototype, 'previousNamedSiblingSafe', {
  get(): SyntaxNode {
    const this_ = this as SyntaxNode;
    return this_.previousNamedSibling ?? this_;
  },
});

Object.defineProperty(SyntaxNode.prototype, 'isLeaf', {
  get(): boolean {
    const this_ = this as SyntaxNode;
    return this_.childCount === 0;
  },
});
