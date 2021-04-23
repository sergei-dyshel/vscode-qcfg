import type { SyntaxNode, SyntaxType, SyntaxSymbol, SymbolType } from '.';
import { assert, assertNotNull } from '../exception';
import { izip } from '../tsUtils';

export interface SymbolRule {
  type: SymbolType;
  pattern: NodePattern;
}

interface NodePattern {
  type: SyntaxType;
  isSymbolName?: boolean;
  searchInside?: boolean;

  children?: NodePattern[];
  // fromEnd?: boolean;
}

function matchSymbol(
  node: SyntaxNode,
  pattern: NodePattern,
): { nameNode?: SyntaxNode; searchNodes: SyntaxNode[] } | undefined {
  let nameNode: SyntaxNode | undefined;
  const searchNodes: SyntaxNode[] = [];

  if (node.type !== pattern.type) return;

  if (pattern.children) {
    if (pattern.children.length > node.namedChildren.length) return;

    for (const [child, childPat] of izip(
      node.namedChildren.slice(0, pattern.children.length),
      pattern.children,
    )) {
      const childMatch = matchSymbol(child, childPat);
      if (!childMatch) return;
      assert(
        !(childMatch.nameNode && nameNode),
        'Multiple nodes define symbol name',
      );
      nameNode = childMatch.nameNode;
      searchNodes.push(...childMatch.searchNodes);
    }
  }

  return { nameNode, searchNodes };
}

function findSymbols(
  node: SyntaxNode,
  rules: SymbolRule[],
  symbols: SyntaxSymbol[],
) {
  for (const rule of rules) {
    const match = matchSymbol(node, rule.pattern);
    if (!match) continue;
    assertNotNull(match.nameNode, 'Did not find name node');

    const nameNode = match.nameNode;
    const sym = {
      type: rule.type,
      name: nameNode.text,
      nameRange: { start: nameNode.startPosition, end: nameNode.endPosition },
      range: { start: node.startPosition, end: node.endPosition },
    };
    symbols.push(sym);

    for (const subNode of match.searchNodes)
      findSymbols(subNode, rules, symbols);
    return;
  }

  // no rules matched
  for (const child of node.namedChildren) findSymbols(child, rules, symbols);
}
