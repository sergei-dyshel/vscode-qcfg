import type { DocumentSymbol, SymbolInformation } from 'vscode';
import { SymbolKind, ThemeColor, ThemeIcon } from 'vscode';
import type { StringKeyOf } from '../../library/enum';
import { enumUtil } from '../../library/enum';
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

export function isDocumentSymbol(
  symbol: SymbolInformation | DocumentSymbol,
): symbol is DocumentSymbol {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (symbol as any).children !== undefined;
}
