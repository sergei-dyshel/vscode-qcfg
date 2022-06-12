import type { NodePattern } from '../pattern';
import type { SyntaxType } from '../syntaxNode';

function type2pattern(val: NodePattern | SyntaxType): NodePattern {
  if (typeof val === 'string') return { type: val };
  return val;
}

export function node(
  type: SyntaxType,
  children: Array<NodePattern | SyntaxType>,
): NodePattern {
  return { type, children: children.map(type2pattern) };
}

export function name(val: NodePattern | SyntaxType) {
  const pattern = type2pattern(val);
  pattern.isSymbolName = true;
  return pattern;
}

export function compound(val: NodePattern | SyntaxType) {
  const pattern = type2pattern(val);
  pattern.isCompound = true;
  return pattern;
}
