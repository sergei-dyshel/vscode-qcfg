import type {
  CallHierarchyOutgoingCall,
  CallHierarchyProvider,
  CancellationToken,
  DocumentSymbol,
  ExtensionContext,
  Position,
  ProviderResult,
  Range,
  TextDocument,
  Uri,
} from 'vscode';
import {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  languages,
  Location,
  workspace,
} from 'vscode';
import { concatArrays, filterNonNull } from '../../library/tsUtils';
import { mapAsync } from './async';
import { Modules } from './module';
import { executeDocumentSymbolProvider } from './peekOutline';
import { executeDefinitionProvider, executeReferenceProvider } from './search';

function symbolToCall(uri: Uri, symbol: DocumentSymbol): CallHierarchyItem {
  const relpath = workspace.asRelativePath(uri);
  return new CallHierarchyItem(
    symbol.kind,
    symbol.name,
    relpath,
    uri,
    symbol.range,
    symbol.selectionRange,
  );
}

function rangeToSymbol(
  range: Range,
  symbols: DocumentSymbol[],
): DocumentSymbol | undefined {
  for (const symbol of symbols) {
    const child = rangeToSymbol(range, symbol.children);
    if (child) return child;
  }
  return symbols.firstOf((sym) => sym.range.contains(range));
}

async function location2Call(
  location: Location,
): Promise<CallHierarchyItem | undefined> {
  const symbols = await executeDocumentSymbolProvider(location.uri);
  const symbol = rangeToSymbol(location.range, symbols);
  return symbol ? symbolToCall(location.uri, symbol) : undefined;
}

const callHierarchyProvider: CallHierarchyProvider = {
  async prepareCallHierarchy(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
  ): Promise<CallHierarchyItem[]> {
    const definitions = await executeDefinitionProvider(document.uri, position);
    return filterNonNull(
      await mapAsync(definitions, async (loc) => location2Call(loc)),
    );
  },

  async provideCallHierarchyIncomingCalls(
    item: CallHierarchyItem,
    _token: CancellationToken,
  ): Promise<CallHierarchyIncomingCall[]> {
    const refs = await executeReferenceProvider(
      item.uri,
      item.selectionRange.end,
    );
    refs.sort(Location.compare);
    // array of incoming calls, each may be undefined
    const callsOrNulls = await mapAsync(refs, async (ref) => {
      const call = await location2Call(ref);
      return call
        ? new CallHierarchyIncomingCall(call, [ref.range])
        : undefined;
    });
    // filter undefined and orinal item
    const allCalls = filterNonNull(callsOrNulls).filter(
      (call) => !call.from.range.isEqual(item.range),
    );
    const groupedCalls = allCalls.group(
      (call1, call2) =>
        call1.from.uri.fsPath === call2.from.uri.fsPath &&
        call1.from.range.isEqual(call2.from.range),
    );
    return groupedCalls.map(
      (calls) =>
        new CallHierarchyIncomingCall(
          calls[0].from,
          concatArrays(...calls.map((call) => call.fromRanges)),
        ),
    );
  },

  provideCallHierarchyOutgoingCalls(
    _item: CallHierarchyItem,
    _token: CancellationToken,
  ): ProviderResult<CallHierarchyOutgoingCall[]> {
    return [];
  },
};

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerCallHierarchyProvider('*', callHierarchyProvider),
  );
}

Modules.register(activate);
