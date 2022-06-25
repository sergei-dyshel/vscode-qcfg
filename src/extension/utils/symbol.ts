import type { SymbolInformation, Uri } from 'vscode';
import {
  commands,
  DocumentSymbol,
  SymbolKind,
  ThemeColor,
  ThemeIcon,
} from 'vscode';
import type { StringKeyOf } from '../../library/enum';
import { enumUtil } from '../../library/enum';
import { assert } from '../../library/exception';
import { convCamelCase, convKebabCase } from '../../library/stringUtils';

const symbolKindUtil = enumUtil(
  SymbolKind as unknown as Record<StringKeyOf<SymbolKind>, number>,
);

declare module 'vscode' {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export namespace SymbolKind {
    function stringKey(kind: SymbolKind): string;
    function themeIcon(kind: SymbolKind): ThemeIcon;
  }
}

SymbolKind.stringKey = function (kind: SymbolKind) {
  return symbolKindUtil.getKeyOrThrow(kind);
};

SymbolKind.themeIcon = function (kind: SymbolKind) {
  const key = SymbolKind.stringKey(kind);
  return new ThemeIcon(
    `symbol-${convKebabCase(key)}`,
    new ThemeColor(`symbolIcon.${convCamelCase(key)}Foreground`),
  );
};

/**
 * Run `vscode.executeDocumentSymbolProvider`.
 */
export async function executeDocumentSymbolProvider(
  uri: Uri,
): Promise<DocumentSymbol[] | SymbolInformation[] | undefined> {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return commands.executeCommand<
    DocumentSymbol[] | SymbolInformation[] | undefined
  >('vscode.executeDocumentSymbolProvider', uri);
}

/**
 * Same as {@link executeDocumentSymbolProvider} but assert
 * that specifically array {@link DocumentSymbol} and not {@link SymbolInformation} was returned;
 */
export async function retrieveDocumentSymbols(
  uri: Uri,
): Promise<DocumentSymbol[] | undefined> {
  const results = await executeDocumentSymbolProvider(uri);
  if (!results || results.isEmpty)
    return results as DocumentSymbol[] | undefined;
  assert(
    isDocumentSymbol(results[0]),
    'Unsupported: Document symbol provider returned SymbolInformation',
  );
  return results as DocumentSymbol[];
}

export function isDocumentSymbol(
  symbol: SymbolInformation | DocumentSymbol,
): symbol is DocumentSymbol {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (symbol as any).children !== undefined;
}

/**
 * Convert {@link SymbolInformation} to {@link DocumentSymbol}.
 */
export function convSymInfoToDocSymbol(
  info: SymbolInformation,
): DocumentSymbol {
  return new DocumentSymbol(
    info.name,
    info.containerName,
    info.kind,
    info.location.range,
    info.location.range,
  );
}
