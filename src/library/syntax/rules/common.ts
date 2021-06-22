import { SyntaxType } from '../syntaxNode';
import { NodePattern } from '../pattern';
import { SymbolType } from '../symbol';

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
