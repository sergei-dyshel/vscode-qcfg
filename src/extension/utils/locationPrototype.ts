import type { TextEditor, ViewColumn } from "vscode";
import { Location, Range, window } from "vscode";
import { defaultCompare } from "../../library/compare";

declare module "vscode" {
  // eslint-disable-next-line @typescript-eslint/no-shadow
  export namespace Location {
    function compare(loc1: Location, loc2: Location): number;
    function equal(loc1: Location, loc2: Location): boolean;
  }
  export interface Location {
    show: (options?: {
      viewColumn?: ViewColumn;
      preserveFocus?: boolean;
      preview?: boolean;
    }) => Promise<TextEditor>;
    startLocation: Location;

    equals: (other: Location) => boolean;
    toString: () => string;
  }
}
Location.compare = function (loc1: Location, loc2: Location): number {
  return (
    defaultCompare(loc1.uri.fsPath, loc2.uri.fsPath) ||
    Range.compare(loc1.range, loc2.range)
  );
};

Location.equal = function (loc1: Location, loc2: Location): boolean {
  return loc1.equals(loc2);
};

Location.prototype.show = async function (
  this: Location,
  options?: {
    viewColumn?: ViewColumn;
    preserveFocus?: boolean;
    preview?: boolean;
  },
): Promise<TextEditor> {
  return window.showTextDocument(this.uri, {
    selection: this.range,
    ...options,
  });
};

Location.prototype.equals = function (this: Location, other: Location) {
  return this.uri.equals(other.uri) && this.range.isEqual(other.range);
};

Location.prototype.toString = function (this: Location) {
  return `${this.uri}:${this.range}`;
};

Object.defineProperty(Location.prototype, "startLocation", {
  get() {
    const this_ = this as Location;
    return new Location(this_.uri, this_.range.start);
  },
});
