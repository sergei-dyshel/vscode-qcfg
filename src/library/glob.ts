import * as minimatch from 'minimatch';

export function fileMatch(
  filename: string,
  pattern: string,
  options?: minimatch.IOptions,
): boolean {
  return minimatch.default(filename, pattern, options);
}
