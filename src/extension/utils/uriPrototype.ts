import { Uri } from 'vscode';

declare module 'vscode' {
  export interface Uri {
    equals: (other: Uri) => boolean;
  }
}

Uri.prototype.equals = function (this: Uri, other: Uri) {
  return (
    this.scheme === other.scheme &&
    this.authority === other.authority &&
    this.path === other.path &&
    this.query === other.query &&
    this.fragment === other.fragment
  );
};
