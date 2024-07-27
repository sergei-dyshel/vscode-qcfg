/* eslint-disable @typescript-eslint/unbound-method */
import { Selection } from "vscode";

declare module "vscode" {
  export interface Selection {
    reverse: () => Selection;
  }
}

Selection.prototype.reverse = function (this: Selection): Selection {
  return new Selection(this.active, this.anchor);
};
