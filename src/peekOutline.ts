import {
  ExtensionContext,
  languages,
  CallHierarchyProvider,
  TextDocument,
  Position,
  CancellationToken,
  CallHierarchyItem,
  CallHierarchyIncomingCall,
  CallHierarchyOutgoingCall,
  commands,
  SymbolInformation,
  DocumentSymbol,
  Range,
  Location,
  SymbolKind,
} from 'vscode';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';
import { peekLocations } from './fileUtils';
import { registerAsyncCommandWrapped } from './exception';
import { offsetPosition } from './textUtils';
import { log } from './logging';

export type OutlineSymbol = SymbolInformation | DocumentSymbol;
export type Outline = OutlineSymbol[];

/**
 * Quickly browse outline hierarchy by using 'Peek Call Hierarchy' window
 */
export async function peekOutlineHierarchy(outline: Outline) {
  log.assert(!outlineToPeek);
  outlineToPeek = outline;
  await commands.executeCommand('editor.showCallHierarchy');
}

// Private

class OutlineRoot extends CallHierarchyItem {
  constructor(public outline: Outline, public document: TextDocument) {
    super(
      SymbolKind.File,
      '',
      '',
      document.uri,
      new Range(0, 0, 0, 0),
      new Range(0, 0, 0, 0),
    );
  }
}

function isDocumentSymbol(symbol: OutlineSymbol): symbol is DocumentSymbol {
  return (
    'detail' in symbol &&
    'range' in symbol &&
    'selectionRange' in symbol &&
    'children' in symbol
  );
}

class OutlineEntry extends CallHierarchyItem {
  public symbol: SymbolInformation | DocumentSymbol;
  public document: TextDocument;

  constructor(
    symbol: SymbolInformation | DocumentSymbol,
    document: TextDocument,
  ) {
    if (isDocumentSymbol(symbol))
      super(
        symbol.kind,
        symbol.name,
        symbol.detail,
        document.uri,
        symbol.range,
        symbol.selectionRange,
      );
    else
      super(
        symbol.kind,
        symbol.name,
        symbol.containerName,
        symbol.location.uri,
        symbol.location.range,
        symbol.location.range,
      );
    this.symbol = symbol;
    this.document = document;
  }
}

let outlineToPeek: Outline | undefined;

async function peekDocumentOutline() {
  const document = getActiveTextEditor().document;
  const outline = (await commands.executeCommand(
    'vscode.executeDocumentSymbolProvider',
    document.uri,
  )) as Outline;
  await peekOutlineHierarchy(outline);
}

const outlineHierarchyProvider: CallHierarchyProvider = {
  async prepareCallHierarchy(
    document: TextDocument,
    _: Position,
    __: CancellationToken,
  ): Promise<CallHierarchyItem | undefined> {
    if (!outlineToPeek) return undefined;
    const outline = outlineToPeek;
    outlineToPeek = undefined;
    return new OutlineRoot(outline, document);
  },

  async provideCallHierarchyIncomingCalls(
    _: CallHierarchyItem,
    __: CancellationToken,
  ): Promise<CallHierarchyIncomingCall[]> {
    return [];
  },

  async provideCallHierarchyOutgoingCalls(
    item: CallHierarchyItem,
    __: CancellationToken,
  ): Promise<CallHierarchyOutgoingCall[]> {
    if (item instanceof OutlineRoot) {
      return item.outline.map(symbol => {
        const entry = new OutlineEntry(symbol, item.document);
        return new CallHierarchyOutgoingCall(entry, [entry.selectionRange]);
      });
    }
    if (item instanceof OutlineEntry) {
      const symbol = item.symbol;
      if (isDocumentSymbol(symbol))
        return symbol.children.map(
          child =>
            new CallHierarchyOutgoingCall(
              new OutlineEntry(child, item.document),
              [child.selectionRange],
            ),
        );
      if (symbol instanceof SymbolInformation) return [];
      throw new Error('Unexpected symbol type');
    }
    throw new Error('Unexpected item type');
  },
};

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

async function peekFlatOutline() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const outline = (await commands.executeCommand(
    'vscode.executeDocumentSymbolProvider',
    document.uri,
  )) as Outline;
  const locations = outline.map(symbol => {
    const range =
      symbol instanceof SymbolInformation
        ? symbol.location.range
        : symbol.selectionRange;
    return new Location(
      document.uri,
      range.isSingleLine
        ? range
        : findTextInRange(document, symbol.name, range),
    );
  });
  await peekLocations(locations);
}

function activate(context: ExtensionContext) {
  languages.registerCallHierarchyProvider('*', outlineHierarchyProvider);
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.peekFlatOutline', peekFlatOutline),
    registerAsyncCommandWrapped(
      'qcfg.peekDocumentOutline',
      peekDocumentOutline,
    ),
  );
}

Modules.register(activate);
