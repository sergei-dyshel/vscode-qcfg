/* eslint-disable no-extend-native */
/* eslint-disable @typescript-eslint/unbound-method */

declare global {
  interface String {
    /**
     * Search first occurence of pattern and return the match's [start, length]
     */
    searchFirst: (pattern: string | RegExp) => [number, number] | undefined;

    /**
     * Replace dashes by underscores
     */
    dashesToUnderscores: () => string;
  }
}

String.prototype.searchFirst = function (
  this: string,
  pattern: string | RegExp,
): [start: number, length: number] | undefined {
  if (typeof pattern === "string") {
    const start = this.indexOf(pattern);
    if (start === -1) return;
    return [start, pattern.length];
  }
  const match = pattern.exec(this);
  if (!match) return;
  return [match.index, match[0].length];
};

String.prototype.dashesToUnderscores = function (this: string) {
  return this.replaceAll("-", "_");
};
