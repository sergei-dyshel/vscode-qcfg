import type { SymbolRule } from '../pattern';
import { name, node } from './common';

export const GoRules: SymbolRule[] = [
  {
    type: 'struct',
    pattern: node('type_declaration', [
      node('type_spec', [name('type_identifier'), 'struct_type']),
    ]),
  },
  {
    type: 'var',
    pattern: node('var_declaration', [node('var_spec', [name('identifier')])]),
  },
  {
    type: 'func',
    pattern: node('function_declaration', [name('identifier')]),
  },
  {
    type: 'method',
    pattern: node('method_declaration', [
      'parameter_list',
      name('field_identifier'),
    ]),
  },
];
