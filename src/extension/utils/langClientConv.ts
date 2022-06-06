import type { LocationLink } from 'vscode';
import { Location, Position, Range, SymbolKind, Uri } from 'vscode';
import * as client from 'vscode-languageclient';
import { propagateUndefined, unionizeArrays } from '../../library/tsUtils';
import { locationOrLink } from './document';

export namespace FromClient {
  export function convPosition(pos: client.Position): Position {
    return new Position(pos.line, pos.character);
  }

  export function convRange(range: client.Range): Range {
    return new Range(convPosition(range.start), convPosition(range.end));
  }

  export function convUri(uri: client.DocumentUri): Uri {
    return Uri.parse(uri);
  }

  export function convLocation(loc: client.Location): Location {
    return new Location(convUri(loc.uri), convRange(loc.range));
  }

  export function convLocationLink(loc: client.LocationLink): LocationLink {
    return {
      targetUri: convUri(loc.targetUri),
      targetRange: convRange(loc.targetRange),
      originSelectionRange: propagateUndefined(convRange)(
        loc.originSelectionRange,
      ),
      targetSelectionRange: convRange(loc.targetSelectionRange),
    };
  }

  /** Convert scalar location or array of location/location links into location array
   *
   * Such complex union type is returned by definition/declaration/implementations requests.
   */
  export function convAnyLocations(
    rsp: client.Location | client.Location[] | client.LocationLink[],
  ): Location[] {
    if (Array.isArray(rsp))
      return unionizeArrays<client.Location, client.LocationLink>(rsp)
        .map((loc) => {
          if ('targetRange' in loc) return convLocationLink(loc);
          return convLocation(loc);
        })
        .map(locationOrLink);

    return [convLocation(rsp)];
  }

  export function convSymbolKind(kind: client.SymbolKind): SymbolKind {
    return kind - 1;
  }
}

export namespace ToClient {
  export function convPosition(pos: Position): client.Position {
    return client.Position.create(pos.line, pos.character);
  }

  export function convRange(range: Range): client.Range {
    return client.Range.create(
      convPosition(range.start),
      convPosition(range.end),
    );
  }

  export function convUri(uri: Uri): client.DocumentUri {
    return uri.toString();
  }

  export function convLocation(loc: Location): client.Location {
    return client.Location.create(convUri(loc.uri), convRange(loc.range));
  }

  export function makeTextDocument(uri: Uri): client.TextDocumentIdentifier {
    return client.TextDocumentIdentifier.create(convUri(uri));
  }

  export function makeTextDocumentPosition(
    uri: Uri,
    pos: Position,
  ): client.TextDocumentPositionParams {
    return {
      textDocument: makeTextDocument(uri),
      position: convPosition(pos),
    };
  }

  export function convSymbolKind(kind: SymbolKind): client.SymbolKind {
    return (kind + 1) as client.SymbolKind;
  }
}
