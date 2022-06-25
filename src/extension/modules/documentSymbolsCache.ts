import type {
  DocumentSymbol,
  ExtensionContext,
  TextDocumentChangeEvent,
  Uri,
} from 'vscode';
import { workspace } from 'vscode';
import { retrieveDocumentSymbols } from '../utils/symbol';
import { listenWrapped } from './exception';
import { Modules } from './module';

const documentSymbolsCache = new Map<string, DocumentSymbol[]>();

/**
 * Cached result of executing document symbol provider.
 *
 * Invalidated only when document changes.
 */
export async function getCachedDocumentSymbols(uri: Uri) {
  const key = uri.toString();
  if (documentSymbolsCache.has(key)) return documentSymbolsCache.get(key)!;
  const symbols = await retrieveDocumentSymbols(uri);
  if (symbols) documentSymbolsCache.set(key, symbols);
  return symbols;
}

function onDidChangeTextDocument(event: TextDocumentChangeEvent) {
  documentSymbolsCache.delete(event.document.uri.toString());
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidChangeTextDocument, onDidChangeTextDocument),
  );
}

Modules.register(activate);
