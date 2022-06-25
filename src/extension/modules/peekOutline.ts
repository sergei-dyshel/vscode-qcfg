import type {
  DocumentSymbol,
  ExtensionContext,
  SymbolInformation,
  TextDocument,
} from 'vscode';
import { Location, Range, SymbolKind } from 'vscode';
import { retrieveDocumentSymbols } from '../utils/symbol';
import { registerAsyncCommandWrapped } from './exception';
import { peekLocations } from './fileUtils';
import { updateHistory } from './history';
import { Modules } from './module';
import { offsetPosition } from './textUtils';
import { getActiveTextEditor } from './utils';

export type OutlineSymbol = SymbolInformation | DocumentSymbol;
export type Outline = OutlineSymbol[];

function findTextInRange(
  document: TextDocument,
  text: string,
  range: Range,
): Range {
  const fulltext = document.getText(range);
  const startOffset = fulltext.search(text);
  const start = offsetPosition(document, range.start, startOffset);
  const end = offsetPosition(document, start, text.length);
  return new Range(start, end);
}

function flattenSubtree(
  symbol: DocumentSymbol,
  document: TextDocument,
  parent?: string,
): Location[] {
  if (!symbolIsBlock(symbol)) return [];
  const newParent = parent ? parent + '.' + symbol.name : symbol.name;
  const root = [narrowRange(symbol.name, symbol.selectionRange, document)];
  if (shouldSkipChildren(symbol)) return root;
  return root.concat(
    ...symbol.children.map((child) =>
      flattenSubtree(child, document, newParent),
    ),
  );
}

function flattenOutline(
  symbols: DocumentSymbol[],
  document: TextDocument,
): Location[] {
  return ([] as Location[]).concat(
    ...symbols.map((symbol) => flattenSubtree(symbol, document)),
  );
}

function symbolIsBlock(symbol: SymbolInformation | DocumentSymbol) {
  switch (symbol.kind) {
    case SymbolKind.Module:
    case SymbolKind.Namespace:
    case SymbolKind.Function:
    case SymbolKind.Method:
    case SymbolKind.Struct:
    case SymbolKind.Class:
    case SymbolKind.Enum:
    case SymbolKind.Constructor:
    case SymbolKind.Interface:
      return true;
    default:
      return false;
  }
}

function shouldSkipChildren(symbol: DocumentSymbol): boolean {
  switch (symbol.kind) {
    case SymbolKind.Interface:
      return true;
    default:
      return false;
  }
}

function narrowRange(name: string, range: Range, document: TextDocument) {
  return new Location(
    document.uri,
    range.isSingleLine ? range : findTextInRange(document, name, range),
  );
}

async function peekFlatOutline() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const symbols = await retrieveDocumentSymbols(document.uri);
  if (!symbols) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locations = flattenOutline(symbols, document);
  await updateHistory(peekLocations(locations));
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.peekFlatOutline', peekFlatOutline),
  );
}

Modules.register(activate);
