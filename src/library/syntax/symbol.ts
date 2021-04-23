export type SymbolType = 'function' | 'method';

export interface SyntaxSymbol {
  type: SymbolType;
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
