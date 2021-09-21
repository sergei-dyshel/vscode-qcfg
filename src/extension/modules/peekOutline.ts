import type {
  DocumentSymbol,
  ExtensionContext,
  SymbolInformation,
  TextDocument,
  Uri,
} from 'vscode';
import { commands, Location, Range, SymbolKind } from 'vscode';
import { registerAsyncCommandWrapped } from './exception';
import { peekLocations } from './fileUtils';
import { Modules } from './module';
import { offsetPosition } from './textUtils';
import { getActiveTextEditor } from './utils';

export type OutlineSymbol = SymbolInformation | DocumentSymbol;
export type Outline = OutlineSymbol[];

export async function executeDocumentSymbolProvider(uri: Uri) {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return (await commands.executeCommand(
    'vscode.executeDocumentSymbolProvider',
    uri,
  )) as DocumentSymbol[];
}

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

function isDocumentSymbol(
  symbol: SymbolInformation | DocumentSymbol,
): symbol is DocumentSymbol {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (symbol as any).children !== undefined;
}

async function peekFlatOutline() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const outline = (await executeDocumentSymbolProvider(
    document.uri,
  )) as Outline;
  if (outline.isEmpty) return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const locations = isDocumentSymbol(outline[0])
    ? flattenOutline(outline as DocumentSymbol[], document)
    : (outline as SymbolInformation[])
        .filter(symbolIsBlock)
        .map((symbol) => symbol.location);
  await peekLocations(locations);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.peekFlatOutline', peekFlatOutline),
  );
}

Modules.register(activate);
