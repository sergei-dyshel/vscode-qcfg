import { SyntaxNode } from 'tree-sitter';

export { SyntaxNode };

export type SyntaxType =
  | 'class_definition'
  | 'declaration'
  | 'decorated_definition'
  | 'field_identifier'
  | 'function_declaration'
  | 'function_declarator'
  | 'function_definition'
  | 'identifier'
  | 'method_declaration'
  | 'namespace_identifier'
  | 'number_literal'
  | 'object'
  | 'parameter_list'
  | 'preproc_include'
  | 'primitive_type'
  | 'scoped_identifier'
  | 'scoped_type_identifier'
  | 'storage_class_specifier'
  | 'string_literal'
  | 'struct_type'
  | 'system_lib_string'
  | 'template_type'
  | 'type_identifier'
  | 'type_declaration'
  | 'type_descriptor'
  | 'type_qualifier'
  | 'type_spec'
  | 'var_declaration'
  | 'var_spec';

declare module 'tree-sitter' {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  class SyntaxNode {}
  interface SyntaxNode {
    readonly nodeType: SyntaxType;
    readonly isLeaf: boolean;
    /** For last sibling returns it */
    readonly nextNamedSiblingSafe: SyntaxNode;
    /** For first sibling returns first */
    readonly previousNamedSiblingSafe: SyntaxNode;

    toObject: () => Record<string, unknown>;
  }
}

Object.defineProperty(SyntaxNode.prototype, 'nodeType', {
  get(): SyntaxType {
    const this_ = this as SyntaxNode;
    return this_.type as SyntaxType;
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

SyntaxNode.prototype.toObject = function (this: SyntaxNode) {
  const range = `[${this.startPosition.row}, ${this.startPosition.column}] - [${this.endPosition.row}, ${this.endPosition.column}]`;
  return {
    type: this.type,
    range,
    children: this.namedChildren.map((child) => child.toObject()),
  };
};
