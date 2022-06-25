import type { Location, LocationLink, Position } from 'vscode';
import { Uri } from 'vscode';
import * as client from 'vscode-languageclient';
import { createConverter as createCodeConverter } from 'vscode-languageclient/lib/codeConverter';
import { createConverter as createProtocolConverter } from 'vscode-languageclient/lib/protocolConverter';
import { unionizeArrays } from '../../library/tsUtils';
import { resolveLocationLinks } from './document';

/** Converter from vscode types to LSP client */
export const c2pConverter = createCodeConverter((uri) => uri.toString());

/** Converter from LSP client types to vscode */
export const p2cConverter = createProtocolConverter((uri) => Uri.parse(uri));

function p2cLocationLink(loc: client.LocationLink): LocationLink {
  return {
    targetUri: p2cConverter.asUri(loc.targetUri),
    targetRange: p2cConverter.asRange(loc.targetRange),
    originSelectionRange: p2cConverter.asRange(loc.originSelectionRange),
    targetSelectionRange: p2cConverter.asRange(loc.targetSelectionRange),
  };
}

/** Convert scalar location or array of location/location links into location array
 *
 * Such complex union type is returned by definition/declaration/implementations requests.
 */
export function p2cAnyLocations(
  rsp: client.Location | client.Location[] | client.LocationLink[],
): Location[] {
  if (Array.isArray(rsp))
    return resolveLocationLinks(
      unionizeArrays<client.Location, client.LocationLink>(rsp).map((loc) => {
        if ('targetRange' in loc) return p2cLocationLink(loc);
        return p2cConverter.asLocation(loc);
      }),
    );

  return [p2cConverter.asLocation(rsp)];
}

// Corresponding functions from c2pConverter accept TextDocument instead of Uri
export function c2pTextDocument(uri: Uri): client.TextDocumentIdentifier {
  return client.TextDocumentIdentifier.create(c2pConverter.asUri(uri));
}

export function c2pTextDocumentPosition(
  uri: Uri,
  pos: Position,
): client.TextDocumentPositionParams {
  return {
    textDocument: c2pTextDocument(uri),
    position: c2pConverter.asPosition(pos),
  };
}
