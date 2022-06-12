import { SyntaxLanguage } from './language';
import { SyntaxTree } from './parsing';
import type { SymbolType, SyntaxSymbol } from './symbol';
import type { SyntaxType } from './syntaxNode';
import { SyntaxNode } from './syntaxNode';

export type { SyntaxType, SyntaxSymbol, SymbolType };
export { SyntaxNode, SyntaxLanguage, SyntaxTree };
