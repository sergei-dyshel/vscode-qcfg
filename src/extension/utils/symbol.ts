import { enumUtil } from "@sergei-dyshel/typescript/enum";
import { camelCase, kebabCase } from "@sergei-dyshel/typescript/string";
import type { StringKeyOf } from "@sergei-dyshel/typescript/types";
import type { Range, SymbolInformation, Uri } from "vscode";
import {
  DocumentSymbol,
  SymbolKind,
  ThemeColor,
  ThemeIcon,
  commands,
} from "vscode";
import { assert } from "../../library/exception";

const symbolKindUtil = enumUtil(
  SymbolKind as unknown as Record<StringKeyOf<SymbolKind>, number>,
);

declare module "vscode" {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export namespace SymbolKind {
    function stringKey(kind: SymbolKind): string;
    function themeIcon(kind: SymbolKind): ThemeIcon;
    /** Icon with `$(..)` syntax, which can be used inside label */
    function labelIcon(kind: SymbolKind): string;
  }
}

SymbolKind.stringKey = function (kind: SymbolKind) {
  return symbolKindUtil.getKeyOrThrow(kind);
};

SymbolKind.themeIcon = function (kind: SymbolKind) {
  const key = SymbolKind.stringKey(kind);
  return new ThemeIcon(
    `symbol-${kebabCase(key)}`,
    new ThemeColor(`symbolIcon.${camelCase(key)}Foreground`),
  );
};

SymbolKind.labelIcon = function (kind: SymbolKind) {
  const key = SymbolKind.stringKey(kind);
  return `$(symbol-${kebabCase(key)})`;
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
  >("vscode.executeDocumentSymbolProvider", uri);
}

/**
 * Same as {@link executeDocumentSymbolProvider} but assert that specifically
 * array {@link DocumentSymbol} and not {@link SymbolInformation} was returned;
 */
export async function retrieveDocumentSymbols(
  uri: Uri,
): Promise<DocumentSymbol[] | undefined> {
  const results = await executeDocumentSymbolProvider(uri);
  if (!results || results.isEmpty)
    return results as DocumentSymbol[] | undefined;
  assert(
    isDocumentSymbol(results[0]),
    "Unsupported: Document symbol provider returned SymbolInformation",
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

/**
 * Recursively search for most nested symbol that contains given range.
 *
 * Symbol will have filled chain of {@link DocumentSymbol.parent}.
 *
 * @param parent Used internally in nested recursive call
 */
export function getContainingSymbol(
  range: Range,
  symbols: DocumentSymbol[],
  parent?: DocumentSymbol,
): DocumentSymbol | undefined {
  for (const symbol of symbols) {
    const child = getContainingSymbol(range, symbol.children, symbol);
    if (child) return child;
    if (symbol.range.contains(range)) {
      symbol.parent = parent;
      return symbol;
    }
  }
  return undefined;
}

declare module "vscode" {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export interface DocumentSymbol {
    /**
     * Parent symbol in tree returned by document symbol provider
     *
     * NOTE: This property should be filled by corresponding functions.
     */
    parent?: DocumentSymbol;

    /*
     * NOTE: adding methods not possible because internally VScode uses
     * different classes (e.g. `MergedInfo`).
     */
  }
}

/**
 * Fully qualified name.
 *
 * Use must fill chain {@link DocumentSymbol.parent} properties in advance.
 */
export function qualifiedName(
  sym: DocumentSymbol,
  languageId: string,
  options?: {
    includeNamespace?: boolean;
  },
): string {
  const sep = ["c", "cpp"].includes(languageId) ? "::" : ".";
  return !sym.parent ||
    (sym.parent.kind === SymbolKind.Namespace && !options?.includeNamespace)
    ? sym.name
    : qualifiedName(sym.parent, languageId) + sep + sym.name;
}
