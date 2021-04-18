import { SyntaxNode } from 'tree-sitter';

export { SyntaxNode };

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
