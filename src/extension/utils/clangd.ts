import type {
  CancellationToken,
  Position,
  TextDocument,
  TypeHierarchyProvider,
} from 'vscode';
import { TypeHierarchyItem } from 'vscode';
import * as vsclc from 'vscode-languageclient';
import { assert, assertNotNull } from '../../library/exception';
import { normalizeArray } from '../../library/tsUtils';
import { handleErrorsAsync } from '../modules/exception';
import { FromClient, ToClient } from './langClientConv';

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
      FromClient.convSymbolKind(item.kind),
      item.name,
      item.detail ?? '',
      FromClient.convUri(item.uri),
      FromClient.convRange(item.range),
      FromClient.convRange(item.selectionRange),
    );
    this.subtypes = item.children;
    this.supertypes = item.parents;
  }

  toClangd(): Clangd.TypeHierarchyItem {
    return {
      kind: ToClient.convSymbolKind(this.kind),
      name: this.name,
      detail: this.detail,
      uri: ToClient.convUri(this.uri),
      range: ToClient.convRange(this.range),
      selectionRange: ToClient.convRange(this.selectionRange),
    };
  }
}

export class ClangdTypeHierarchyProvider implements TypeHierarchyProvider {
  private getNonNullClient() {
    const cl = this.getClient();
    assertNotNull(cl, 'Clangd not running');
    return cl;
  }

  constructor(
    private readonly getClient: () => vsclc.LanguageClient | undefined,
  ) {}

  async prepareTypeHierarchy1(
    document: TextDocument,
    position: Position,
    token: CancellationToken,
  ) {
    const item = await this.getNonNullClient().sendRequest(
      Clangd.TypeHierarchyRequest.type,
      {
        resolve: 3,
        direction: Clangd.TypeHierarchyDirection.Both,
        ...ToClient.makeTextDocumentPosition(document.uri, position),
      },
      token,
    );
    if (item) {
      return new ClangdTypeHierarchyItem(item);
    }
    return undefined;
  }

  prepareTypeHierarchy = handleErrorsAsync(
    this.prepareTypeHierarchy1.bind(this),
  );

  async provideTypeHierarchySubtypes(
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

  async provideTypeHierarchySupertypes(
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
}
