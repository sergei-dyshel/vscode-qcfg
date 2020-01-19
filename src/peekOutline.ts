import {
  ExtensionContext,
  TextDocument,
  commands,
  SymbolInformation,
  DocumentSymbol,
  Range,
  Location,
} from 'vscode';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';
import { peekLocations } from './fileUtils';
import { registerAsyncCommandWrapped } from './exception';
import { offsetPosition } from './textUtils';

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
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.peekFlatOutline', peekFlatOutline),
  );
}

Modules.register(activate);
