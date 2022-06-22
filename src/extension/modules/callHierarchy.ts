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
  CancellationTokenSource,
  commands,
  languages,
  Location,
  SymbolKind,
  TreeItem,
  TreeItemCollapsibleState,
  window,
  workspace,
} from 'vscode';
import { baseName } from '../../library/pathUtils';
import {
  concatArrays,
  filterNonNull,
  normalizeArray,
} from '../../library/tsUtils';
import { CclsCallHierarchyProvider } from '../utils/ccls';
import { mapAsync } from './async';
import { selectRecordFromListMru } from './dialog';
import { handleAsyncStd, registerAsyncCommandWrapped } from './exception';
import { cclsWrapper } from './langClient';
import { Modules } from './module';
import { executeDocumentSymbolProvider } from './peekOutline';
import { executeDefinitionProvider, findProperReferences } from './search';
import type { TreeNode, TreeProvider } from './treeView';
import { QcfgTreeView } from './treeView';
import { getActiveTextEditor } from './utils';

const documentSymbolsCache = new Map<string, DocumentSymbol[]>();

async function getDocumentSymbols(uri: Uri) {
  const key = uri.toString();
  if (documentSymbolsCache.has(key)) return documentSymbolsCache.get(key)!;
  const symbols = await executeDocumentSymbolProvider(uri);
  documentSymbolsCache.set(key, symbols);
  return symbols;
}

class SymbolCallHierarchyItem extends CallHierarchyItem {
  constructor(uri: Uri, symbolPath: DocumentSymbol[]) {
    // const relpath = workspace.asRelativePath(uri);
    const symbol = symbolPath.top!;
    const detail = symbolPath
      .slice(0, symbolPath.length - 1)
      .map((sym) => sym.name)
      .join(' ');
    super(
      symbol.kind,
      symbol.name,
      detail,
      uri,
      symbol.range,
      symbol.selectionRange,
    );
  }
}

function rangeToNestedSymbols(
  range: Range,
  symbols: DocumentSymbol[],
): DocumentSymbol[] | undefined {
  for (const symbol of symbols) {
    const childPath = rangeToNestedSymbols(range, symbol.children);
    if (childPath) return [symbol, ...childPath];
    if (symbol.range.contains(range)) return [symbol];
  }
  return undefined;
}

function nestedSymbolsQualName(symbols: DocumentSymbol[], language: string) {
  const sep = ['c', 'cpp'].includes(language) ? '::' : '.';
  return symbols
    .filter((sym) => sym.kind !== SymbolKind.Namespace)
    .map((sym) => sym.name)
    .join(sep);
}

async function location2Call(
  location: Location,
): Promise<CallHierarchyItem | undefined> {
  const symbols = await getDocumentSymbols(location.uri);
  const symbolPath = rangeToNestedSymbols(location.range, symbols);
  if (!symbolPath) return undefined;
  const symbol = symbolPath.top!;
  return symbol.kind !== SymbolKind.Null
    ? new SymbolCallHierarchyItem(location.uri, symbolPath)
    : undefined;
}

class AdhocCallHierarchyProvider implements CallHierarchyProvider {
  prepareCallHierarchy = async (
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
  ) => {
    const definitions = await executeDefinitionProvider(document.uri, position);
    return filterNonNull(
      await mapAsync(definitions, async (loc) => location2Call(loc)),
    );
  };

  provideCallHierarchyIncomingCalls = async (
    item: CallHierarchyItem,
    _token: CancellationToken,
  ) => {
    const refs = await findProperReferences(
      item.uri,
      item.selectionRange.start,
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
  };

  provideCallHierarchyOutgoingCalls = (
    _item: CallHierarchyItem,
    _token: CancellationToken,
  ) => [];
}

const adhocCallHierarchyProvider = new AdhocCallHierarchyProvider();

class GlobalCallHierarchyProvider implements CallHierarchyProvider {
  prepareCallHierarchy = async (
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
  ) =>
    commands.executeCommand<CallHierarchyItem[]>(
      'vscode.prepareCallHierarchy',
      document.uri,
      position,
    );

  provideCallHierarchyIncomingCalls = async (
    item: CallHierarchyItem,
    _token: CancellationToken,
  ) =>
    commands.executeCommand<ProviderResult<CallHierarchyIncomingCall[]>>(
      'vscode.provideIncomingCalls',
      item,
    );

  provideCallHierarchyOutgoingCalls = async (
    item: CallHierarchyItem,
    _token: CancellationToken,
  ) =>
    commands.executeCommand<ProviderResult<CallHierarchyOutgoingCall[]>>(
      'vscode.provideIncomingCalls',
      item,
    );
}

const globalCallHierarchyProvider = new GlobalCallHierarchyProvider();

class CallTreeNode implements TreeNode {
  constructor(
    readonly provider: CallTreeProvider,
    private readonly call: CallHierarchyItem,
    readonly ranges: Range[],
    private readonly parent?: CallTreeNode,
  ) {}

  async getTreeItem() {
    const symbols = await getDocumentSymbols(this.call.uri);
    const nestedSyms = rangeToNestedSymbols(this.call.selectionRange, symbols);
    const name = nestedSyms
      ? nestedSymbolsQualName(nestedSyms, this.provider.document.languageId)
      : this.call.name;
    const item = new TreeItem(name, TreeItemCollapsibleState.Collapsed);
    item.description = `${baseName(
      this.call.uri.fsPath,
    )} (${SymbolKind.stringKey(this.call.kind)})`;
    item.tooltip = workspace.asRelativePath(this.call.uri);
    item.iconPath = SymbolKind.themeIcon(this.call.kind);

    // prevents expanding/collapsing when item is clicked
    // see: https://github.com/microsoft/vscode/issues/34130#issuecomment-398296698
    item.command = { title: 'noop', command: 'noop' };
    return item;
  }

  getParent() {
    return this.parent;
  }

  async getChildren() {
    return (
      await this.provider.callProvider.provideCallHierarchyIncomingCalls(
        this.call,
        new CancellationTokenSource().token,
      )
    )?.map(
      (call) =>
        new CallTreeNode(this.provider, call.from, call.fromRanges, this),
    );
  }

  async show() {
    return window.showTextDocument(this.call.uri, {
      preserveFocus: true,
      selection: this.ranges[0],
    });
  }
}

class CallTreeProvider implements TreeProvider {
  constructor(
    readonly document: TextDocument,
    private readonly position: Position,
    readonly callProvider: CallHierarchyProvider,
  ) {}

  async getTrees() {
    const items = await this.callProvider.prepareCallHierarchy(
      this.document,
      this.position,
      new CancellationTokenSource().token,
    );
    if (!items) return undefined;
    return normalizeArray(items).map(
      (item) => new CallTreeNode(this, item, [item.selectionRange]),
    );
  }

  getMessage() {
    const word = this.document.getText(
      this.document.getWordRangeAtPosition(this.position),
    );
    return `Call tree for "${word}"`;
  }

  getTitle = () => 'call tree';

  onDidChangeSelection = (nodes: readonly TreeNode[]) => {
    if (!nodes.isEmpty)
      handleAsyncStd((nodes[0] as unknown as CallTreeNode).show());
  };
}

async function showCallTree() {
  const providers: Record<string, CallHierarchyProvider> = {
    adhoc: adhocCallHierarchyProvider,
    global: globalCallHierarchyProvider,
    ccls: new CclsCallHierarchyProvider(() => cclsWrapper.client),
  };
  const editor = getActiveTextEditor();
  const provider = await selectRecordFromListMru(providers, 'qcfgCallTree', {
    title: 'Select call hierarchy provider',
  });
  if (!provider) return;
  QcfgTreeView.setProvider(
    new CallTreeProvider(editor.document, editor.selection.active, provider),
  );
  return QcfgTreeView.revealTree();
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerCallHierarchyProvider('*', adhocCallHierarchyProvider),
    registerAsyncCommandWrapped('qcfg.showCallHierarchyInPanel', showCallTree),
  );
}

Modules.register(activate);
