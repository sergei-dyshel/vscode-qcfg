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
import { getContainingSymbol, qualifiedName } from '../utils/symbol';
import { mapAsync } from './async';
import { selectRecordFromListMru } from './dialog';
import { getCachedDocumentSymbols } from './documentSymbolsCache';
import { handleAsyncStd, registerAsyncCommandWrapped } from './exception';
import { cclsWrapper } from './langClient';
import { Modules } from './module';
import { executeDefinitionProvider, findProperReferences } from './search';
import type { TreeNode, TreeProvider } from './treeView';
import { QcfgTreeView } from './treeView';
import { getActiveTextEditor } from './utils';

class SymbolCallHierarchyItem extends CallHierarchyItem {
  constructor(uri: Uri, symbol: DocumentSymbol, languageId: string) {
    // const relpath = workspace.asRelativePath(uri);
    const name = symbol.name;
    const detail = symbol.parent
      ? qualifiedName(symbol.parent, languageId)
      : '';
    super(symbol.kind, name, detail, uri, symbol.range, symbol.selectionRange);
  }
}

async function location2Call(
  location: Location,
  languageId: string,
): Promise<CallHierarchyItem | undefined> {
  const symbols = await getCachedDocumentSymbols(location.uri);
  if (!symbols) return undefined;
  const symbol = getContainingSymbol(location.range, symbols);
  if (!symbol) return undefined;
  return symbol.kind !== SymbolKind.Null
    ? new SymbolCallHierarchyItem(location.uri, symbol, languageId)
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
      await mapAsync(definitions, async (loc) =>
        location2Call(loc, document.languageId),
      ),
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
      const document = await workspace.openTextDocument(ref.uri);
      const call = await location2Call(ref, document.languageId);
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

  getTreeItem() {
    const item = new TreeItem(
      this.call.name,
      TreeItemCollapsibleState.Collapsed,
    );
    item.description = [
      this.call.detail ?? '',
      '-',
      baseName(this.call.uri.fsPath),
    ].join(' ');
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
