import { Location, Range } from 'vscode';
import { defaultCompare } from '../../library/compare';

declare module 'vscode' {
  // eslint-disable-next-line no-shadow
  export namespace Location {
    function compare(loc1: Location, loc2: Location): number;
  }
}
Location.compare = function(loc1: Location, loc2: Location): number {
  return (
    defaultCompare(loc1.uri.fsPath, loc2.uri.fsPath) ||
    Range.compare(loc1.range, loc2.range)
  );
};
