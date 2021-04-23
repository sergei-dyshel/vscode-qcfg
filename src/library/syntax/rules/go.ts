import type { SymbolRule } from '../pattern';

const GoRules: SymbolRule[] = [
  {
    type: 'function',
    pattern: {
      type: 'type_declaration',
      children: [
        {
          type: 'type_spec',
          children: [
            {
              type: 'type_identifier',
              isSymbolName: true,
            },
            {
              type: 'struct_type',
            },
          ],
        },
      ],
    },
  },
];
