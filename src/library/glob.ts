import * as minimatch from 'minimatch';

export function fileMatch(filename: string, pattern: string): boolean {
  return minimatch.default(filename, pattern);
}
