import { getActiveTextEditor, QuickPickLocations } from "@sergei-dyshel/vscode";
import type {
  DocumentSymbol,
  ExtensionContext,
  SymbolInformation,
  TextDocument,
} from "vscode";
import { Location, SymbolKind } from "vscode";
import { qualifiedName, retrieveDocumentSymbols } from "../utils/symbol";
import { registerAsyncCommandWrapped } from "./exception";
import { updateHistory } from "./history";
import { Modules } from "./module";

const minLinesInBlock = 10;

function flattenSubtree(
  symbol: DocumentSymbol,
  document: TextDocument,
  parent?: DocumentSymbol,
): DocumentSymbol[] {
  if (
    !symbolIsBlock(symbol) ||
    symbol.range.end.line - symbol.range.start.line <= minLinesInBlock
  )
    return [];
  symbol.parent = parent;
  let result: DocumentSymbol[] = [];
  if (shouldSkipChildren(symbol)) {
    result.push(symbol);
    return result;
  }
  // eslint-disable-next-line unicorn/prefer-spread
  result = result.concat(
    ...symbol.children.map((child) => flattenSubtree(child, document, symbol)),
  );
  if (result.isEmpty) {
    result.push(symbol);
    return result;
  }
  if (result[0].range.start.line - symbol.range.start.line >= 5) {
    result.unshift(symbol);
  }
  return result;
}

function flattenOutline(
  symbols: DocumentSymbol[],
  document: TextDocument,
): DocumentSymbol[] {
  // eslint-disable-next-line unicorn/prefer-spread
  return ([] as DocumentSymbol[]).concat(
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
  // eslint-disable-next-line sonarjs/no-small-switch
  switch (symbol.kind) {
    case SymbolKind.Interface:
      return true;
    default:
      return false;
  }
}

async function peekFlatOutline() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const symbols = await retrieveDocumentSymbols(document.uri);
  if (!symbols) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const flatSymbols = flattenOutline(symbols, document);
  const qp = new QuickPickLocations<DocumentSymbol>(
    (sym) => ({
      label: `${SymbolKind.labelIcon(sym.kind)} ${sym.name}`,
      description: sym.parent
        ? qualifiedName(sym.parent, document.languageId, {
            includeNamespace: true,
          })
        : undefined,
    }),
    (sym) => new Location(document.uri, sym.selectionRange),
    flatSymbols,
  );
  qp.adjustActiveItem();
  await updateHistory(qp.select());
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.peekFlatOutline", peekFlatOutline),
  );
}

Modules.register(activate);
