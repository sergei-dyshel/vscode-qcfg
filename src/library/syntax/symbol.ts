export type SymbolType = 'function' | 'method';

export interface SyntaxSymbol {
  type: string;
  name: string;
  nameRange: SyntaxSymbol.Range;
  range: SyntaxSymbol.Range;
}

export namespace SyntaxSymbol {
  export interface Position {
    row: number;
    column: number;
  }
  export interface Range {
    start: Position;
    end: Position;
  }
}

export function syntaxSymbolToObject(sym: SyntaxSymbol) {
  return {
    type: sym.type,
    name: sym.name,
    nameRange: rangeToString(sym.nameRange),
    range: rangeToString(sym.range),
  };
}

function rangeToString(range: SyntaxSymbol.Range) {
  return `[${range.start.row},${range.start.column}] - [${range.end.row},${range.end.column}]`;
}
