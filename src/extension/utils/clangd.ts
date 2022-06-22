import type {
  CancellationToken,
  Position,
  TextDocument,
  TypeHierarchyProvider,
} from 'vscode';
import { TypeHierarchyItem } from 'vscode';
import * as vsclc from 'vscode-languageclient';
import { assert } from '../../library/exception';
import { log } from '../../library/logging';
import { normalizeArray } from '../../library/tsUtils';
import { handleErrorsAsync } from '../modules/exception';
import { BaseLangClientProvider } from './langClientCommon';
import { c2pConverter, p2cConverter } from './langClientConv';

export namespace Clangd {
  export interface ASTNode {
    role: string;
    kind: string;
    detail?: string;
    arcana?: string;
    range: vsclc.Range;
    children?: ASTNode[];
  }

  // type hierarchy stuff copied from clangd's extension code

  export namespace TypeHierarchyDirection {
    export const Children = 0;
    export const Parents = 1;
    export const Both = 2;
  }

  type TypeHierarchyDirection = 0 | 1 | 2;

  interface TypeHierarchyParams extends vsclc.TextDocumentPositionParams {
    resolve?: number;
    direction: TypeHierarchyDirection;
  }

  export interface TypeHierarchyItem {
    name: string;
    detail?: string;
    kind: vsclc.SymbolKind;
    deprecated?: boolean;
    uri: string;
    range: vsclc.Range;
    selectionRange: vsclc.Range;
    parents?: TypeHierarchyItem[];
    children?: TypeHierarchyItem[];
  }

  export namespace TypeHierarchyRequest {
    export const type = new vsclc.RequestType<
      TypeHierarchyParams,
      TypeHierarchyItem | null,
      void
    >('textDocument/typeHierarchy');
  }

  interface ResolveTypeHierarchyItemParams {
    item: TypeHierarchyItem;
    resolve: number;
    direction: TypeHierarchyDirection;
  }

  export namespace ResolveTypeHierarchyRequest {
    export const type = new vsclc.RequestType<
      ResolveTypeHierarchyItemParams,
      TypeHierarchyItem | null,
      void
    >('typeHierarchy/resolve');
  }
}

class ClangdTypeHierarchyItem extends TypeHierarchyItem {
  subtypes?: Clangd.TypeHierarchyItem[];
  supertypes?: Clangd.TypeHierarchyItem[];

  constructor(item: Clangd.TypeHierarchyItem) {
    super(
      p2cConverter.asSymbolKind(item.kind),
      item.name,
      item.detail ?? '',
      p2cConverter.asUri(item.uri),
      p2cConverter.asRange(item.range),
      p2cConverter.asRange(item.selectionRange),
    );
    this.subtypes = item.children;
    this.supertypes = item.parents;
  }

  toClangd(): Clangd.TypeHierarchyItem {
    return {
      kind: c2pConverter.asSymbolKind(this.kind),
      name: this.name,
      detail: this.detail,
      uri: c2pConverter.asUri(this.uri),
      range: c2pConverter.asRange(this.range),
      selectionRange: c2pConverter.asRange(this.selectionRange),
    };
  }
}

export class ClangdTypeHierarchyProvider
  extends BaseLangClientProvider
  implements TypeHierarchyProvider
{
  private async prepareTypeHierarchyImpl(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
  ) {
    const cl = this.getClient();
    if (!cl) {
      log.debug('Clangd not running');
      return undefined;
    }
    log.debug('running');
    const item = await cl.sendRequest(
      Clangd.TypeHierarchyRequest.type,
      {
        resolve: 3,
        direction: Clangd.TypeHierarchyDirection.Both,
        ...c2pConverter.asTextDocumentPositionParams(document, position),
      },
      token,
    );
    if (item) {
      return new ClangdTypeHierarchyItem(item);
    }
    return undefined;
  }

  prepareTypeHierarchy = handleErrorsAsync(
    this.prepareTypeHierarchyImpl.bind(this),
  );

  private async provideTypeHierarchySubtypesImpl(
    item: TypeHierarchyItem,
    token: CancellationToken,
  ) {
    assert(item instanceof ClangdTypeHierarchyItem);
    const subtypes = normalizeArray<Clangd.TypeHierarchyItem>(
      item.subtypes ??
        (await this.getNonNullClient().sendRequest(
          Clangd.ResolveTypeHierarchyRequest.type,
          {
            item: item.toClangd(),
            resolve: 3,
            direction: Clangd.TypeHierarchyDirection.Children,
          },
          token,
        )) ??
        [],
    );
    return subtypes.map((x) => new ClangdTypeHierarchyItem(x));
  }

  provideTypeHierarchySubtypes = handleErrorsAsync(
    this.provideTypeHierarchySubtypesImpl.bind(this),
  );

  private async provideTypeHierarchySupertypesImpl(
    item: TypeHierarchyItem,
    token: CancellationToken,
  ) {
    assert(item instanceof ClangdTypeHierarchyItem);
    const subtypes = normalizeArray<Clangd.TypeHierarchyItem>(
      item.supertypes ??
        (await this.getNonNullClient().sendRequest(
          Clangd.ResolveTypeHierarchyRequest.type,
          {
            item: item.toClangd(),
            resolve: 3,
            direction: Clangd.TypeHierarchyDirection.Parents,
          },
          token,
        )) ??
        [],
    );
    return subtypes.map((x) => new ClangdTypeHierarchyItem(x));
  }

  provideTypeHierarchySupertypes = handleErrorsAsync(
    this.provideTypeHierarchySupertypesImpl.bind(this),
  );
}
