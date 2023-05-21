import type { ExtensionContext, Position, Range, TextDocument } from 'vscode';
import { languages, SelectionRange } from 'vscode';
import { assertNotNull } from '../../library/exception';
import { log } from '../../library/logging';
import { handleErrorsAsync } from './exception';
import { Modules } from './module';
import { SyntaxTrees } from './syntaxTree';
import { trimInner } from './textUtils';
import { findContainingNode } from './treeSitter';
import type { SyntaxNode, SyntaxTree } from '../../library/treeSitter';
import { TreeSitter } from '../../library/treeSitter';

function computeSelectionRange(
  document: TextDocument,
  tree: SyntaxTree,
  position: Position,
): SelectionRange {
  let node: SyntaxNode | undefined | null = findContainingNode(
    tree.rootNode,
    position.asRange,
  );
  assertNotNull(node);
  const ranges: Range[] = [];
  ranges.push(position.asRange);
  while (node) {
    const inner = trimInner(document, node.range);
    if (
      node.range.strictlyContains(inner) &&
      inner.strictlyContains(ranges.top!)
    )
      ranges.push(inner);
    ranges.push(node.range);
    node = node.parent;
  }

  log.traceStr('Syntax-based selection range for {}: {}', position, ranges);

  const topSelRange = new SelectionRange(position.asRange);
  let selRange = topSelRange;
  while (!ranges.isEmpty) {
    selRange.parent = new SelectionRange(ranges.shift()!);
    selRange = selRange.parent;
  }
  return topSelRange;
}

async function provideSelectionRanges(
  document: TextDocument,
  positions: Position[],
) {
  const tree = await SyntaxTrees.get(document);
  return positions.map((pos) => computeSelectionRange(document, tree, pos));
}

function activate(extContext: ExtensionContext) {
  extContext.subscriptions.push(
    languages.registerSelectionRangeProvider(TreeSitter.supportedLanguages(), {
      provideSelectionRanges: handleErrorsAsync(provideSelectionRanges),
    }),
  );
}

Modules.register(activate);
