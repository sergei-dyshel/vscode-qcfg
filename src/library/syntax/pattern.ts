import type { SyntaxNode, SyntaxSymbol } from '.';
import { assert, assertNotNull } from '../exception';
import { izip } from '../tsUtils';

export interface SymbolRule {
  type: string;
  pattern: NodePattern;
}

export interface NodePattern {
  type: string;
  isSymbolName?: boolean;
  isCompound?: boolean;

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
  if (pattern.isSymbolName) {
    nameNode = node;
  }

  if (pattern.children) {
    if (pattern.children.length > node.namedChildren.length) return;

    for (const [child, childPat] of izip(
      node.namedChildren.slice(0, pattern.children.length),
      pattern.children,
    )) {
      const childMatch = matchSymbol(child, childPat);
      if (!childMatch) return;
      if (childMatch.nameNode) {
        assert(!nameNode, 'Multiple nodes define symbol name');
        nameNode = childMatch.nameNode;
      }
      searchNodes.push(...childMatch.searchNodes);
    }
  }

  return { nameNode, searchNodes };
}

export function findSymbols(
  node: SyntaxNode,
  rules: SymbolRule[],
  symbols: SyntaxSymbol[],
) {
  for (const rule of rules) {
    const match = matchSymbol(node, rule.pattern);
    if (!match) continue;
    assertNotNull(match.nameNode, 'Did not find name node');

    const nameNode = match.nameNode;
    const sym: SyntaxSymbol = {
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
