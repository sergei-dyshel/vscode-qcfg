/* eslint-disable no-extend-native */
/* eslint-disable @typescript-eslint/unbound-method */
interface String {
  /**
   * Search first occurence of pattern and return the match's [start, length]
   */
  searchFirst(pattern: string | RegExp): [number, number] | undefined;
}

String.prototype.searchFirst = function(
  this: string,
  pattern: string | RegExp,
): [number, number] | undefined {
  if (typeof pattern === 'string') {
    const start = this.search(pattern);
    if (start === -1) return;
    return [start, pattern.length];
  }
  const match = pattern.exec(this);
  if (!match) return;
  return [match.index, match[0].length];
};
