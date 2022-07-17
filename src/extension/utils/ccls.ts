import type {
  CallHierarchyProvider,
  CancellationToken,
  Position,
  TextDocument,
  TypeHierarchyProvider,
} from 'vscode';
import {
  CallHierarchyIncomingCall,
  CallHierarchyItem,
  CallHierarchyOutgoingCall,
  SymbolKind,
  TypeHierarchyItem,
  workspace,
} from 'vscode';
import type { TextDocumentPositionParams } from 'vscode-languageclient';
import * as client from 'vscode-languageclient';
import { assert } from '../../library/exception';
import { log } from '../../library/logging';
import { handleErrorsAsync, stdErrorHandler } from '../modules/exception';
import { BaseLangClientProvider } from './langClientCommon';
import { c2pTextDocumentPosition, p2cConverter } from './langClientConv';

export namespace Ccls {
  export enum RefRole {
    DECLARATION = 0,
    DEFINITION = 1 << 1,
    REFERENCE = 1 << 2,
    READ = 1 << 3,
    WRITE = 1 << 4,
    CALL = 1 << 5,
    DYNAMIC = 1 << 6,
    ADDRESS = 1 << 7,
    IMPLICIT = 1 << 8,

    ASSIGNMENT = DEFINITION | WRITE | ADDRESS,
  }

  const refRoleStrings = {
    declaration: RefRole.DECLARATION,
    definition: RefRole.DEFINITION,
    reference: RefRole.REFERENCE,
    read: RefRole.READ,
    write: RefRole.WRITE,
    call: RefRole.CALL,
    dynamic: RefRole.DYNAMIC,
    address: RefRole.ADDRESS,
    implicit: RefRole.IMPLICIT,
  };

  export function refRoleFromString(role: string) {
    assert(allRefRoles.includes(role));
    return (refRoleStrings as Record<string, RefRole>)[role];
  }

  export const allRefRoles = Object.keys(refRoleStrings);
}

enum CallType {
  NORMAL = 0,
  BASE = 1,
  DERIVED = 2,
  ALL = BASE | DERIVED,
}

export interface HierarchyNode {
  id: unknown;
  name: string;
  location: client.Location;
  numChildren: number;
  children: HierarchyNode[];
  useRange: client.Range;
}

interface CallHierarchyNode extends HierarchyNode {
  children: CallHierarchyNode[];
  callType: CallType;
}

class CclsCallHierarchyItem extends CallHierarchyItem {
  constructor(readonly node: CallHierarchyNode) {
    const range = p2cConverter.asRange(node.location.range);
    const uri = p2cConverter.asUri(node.location.uri);
    super(
      SymbolKind.Function,
      node.name,
      workspace.asRelativePath(uri),
      uri,
      range,
      range,
    );
  }
}

export class CclsCallHierarchyProvider
  extends BaseLangClientProvider
  implements CallHierarchyProvider
{
  private async prepareCallHierarchyImpl(
    document: TextDocument,
    position: Position,
    _token: CancellationToken,
  ) {
    const cl = this.getClient();
    if (!cl) {
      log.debug('ccls not running');
      return undefined;
    }
    log.debug('running');
    const node = await cl.sendRequest<CallHierarchyNode | undefined>(
      '$ccls/call',
      {
        callType: CallType.ALL,
        callee: true,
        hierarchy: true,
        levels: 0,
        position,
        qualified: true,
        textDocument: {
          uri: document.uri.toString(true),
        },
      },
    );
    if (!node) {
      return;
    }
    return new CclsCallHierarchyItem(node);
  }

  prepareCallHierarchy = handleErrorsAsync(
    this.prepareCallHierarchyImpl.bind(this),
  );

  private async provideCallHierarchyIncomingCallsImpl(
    item: CallHierarchyItem,
    _token: CancellationToken,
  ): Promise<CallHierarchyIncomingCall[]> {
    const node = (item as CclsCallHierarchyItem).node;
    const nodeWithChildren = await this.getChildren(node, false);
    const groupedChildren = nodeWithChildren.children.group(
      (node1, node2) => node1.id === node2.id,
    );
    const results = groupedChildren.map((nodes) => {
      const childItem = new CclsCallHierarchyItem(nodes[0]);
      const useRanges = nodes.map((groupedNode) =>
        p2cConverter.asRange(groupedNode.useRange),
      );
      return new CallHierarchyIncomingCall(childItem, useRanges);
    });
    return results;
  }

  provideCallHierarchyIncomingCalls = handleErrorsAsync(
    this.provideCallHierarchyIncomingCallsImpl.bind(this),
  );

  private async provideCallHierarchyOutgoingCallsImpl(
    item: CallHierarchyItem,
    _token: CancellationToken,
  ): Promise<CallHierarchyOutgoingCall[]> {
    const node = (item as CclsCallHierarchyItem).node;
    const result = await this.getChildren(node, true);
    return result.children.map(
      (child) =>
        new CallHierarchyOutgoingCall(new CclsCallHierarchyItem(child), []),
    );
  }

  provideCallHierarchyOutgoingCalls = handleErrorsAsync(
    this.provideCallHierarchyOutgoingCallsImpl.bind(this),
  );

  private async getChildren(
    node: CallHierarchyNode,
    callee: boolean,
  ): Promise<CallHierarchyNode> {
    return this.getNonNullClient().sendRequest<CallHierarchyNode>(
      '$ccls/call',
      {
        callType: CallType.ALL,
        callee,
        hierarchy: true,
        id: node.id,
        levels: 1,
        qualified: true,
      },
    );
  }
}

interface TypeHierarchyNode extends HierarchyNode {
  children: TypeHierarchyNode[];
  kind: number;

  /** If true and children need to be expanded derived will be used, otherwise base will be used. */
  wantsDerived: boolean;
  isBaseLabel?: boolean;
}

class CclsTypeHierarchyItem extends TypeHierarchyItem {
  constructor(readonly node: TypeHierarchyNode) {
    const uri = p2cConverter.asUri(node.location.uri);
    const range = p2cConverter.asRange(node.location.range);
    super(
      SymbolKind.Class,
      node.name,
      workspace.asRelativePath(uri),
      uri,
      range,
      range,
    );
  }
}

type CclsTypeHierarchyParams = {
  derived?: boolean;
  hierarchy?: boolean;
  levels?: number;
  qualified?: boolean;
} & (
  | {
      id: unknown;
      kind: number;
    }
  | TextDocumentPositionParams
);

const CclsTypeHierarchyRequestType = new client.RequestType<
  CclsTypeHierarchyParams,
  TypeHierarchyNode | undefined,
  void
>('$ccls/inheritance');

export class CclsTypeHierarchyProvider
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
      log.debug('ccls not running');
      return undefined;
    }
    log.debug('running');
    const node = await cl.sendRequest(
      CclsTypeHierarchyRequestType,
      {
        derived: true,
        hierarchy: true,
        levels: 1,
        qualified: true,
        ...c2pTextDocumentPosition(document.uri, position),
      },
      token,
    );
    if (!node) return node;
    return new CclsTypeHierarchyItem(node);
  }

  prepareTypeHierarchy = handleErrorsAsync(
    this.prepareTypeHierarchyImpl.bind(this),
  );

  private async getChildren(
    item: TypeHierarchyItem,
    derived: boolean,
    token: CancellationToken,
  ) {
    assert(item instanceof CclsTypeHierarchyItem);
    const newNode = await this.getNonNullClient().sendRequest(
      CclsTypeHierarchyRequestType,
      {
        id: item.node.id,
        kind: item.node.kind,
        derived,
        hierarchy: true,
        levels: 1,
        qualified: true,
      },
      token,
    );
    if (!newNode) return undefined;
    return newNode.children.map((child) => new CclsTypeHierarchyItem(child));
  }

  async provideTypeHierarchySubtypes(
    item: TypeHierarchyItem,
    token: CancellationToken,
  ) {
    try {
      return await this.getChildren(item, true /* derived */, token);
    } catch (err) {
      stdErrorHandler(err);
    }
  }

  async provideTypeHierarchySupertypes(
    item: TypeHierarchyItem,
    token: CancellationToken,
  ) {
    try {
      return await this.getChildren(item, false /* derived */, token);
    } catch (err) {
      stdErrorHandler(err);
    }
  }
}
