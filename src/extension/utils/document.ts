import type { LocationLink } from 'vscode';
import { Location } from 'vscode';

/** Convert Location/LocationLink union, as returned by some functions, to Location */
export function locationOrLink(loc: Location | LocationLink): Location {
  if ('targetRange' in loc) {
    const range = loc.targetSelectionRange ?? loc.targetRange;
    return new Location(loc.targetUri, range);
  }
  return loc;
}
