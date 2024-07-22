import * as minimatch from "minimatch";

export function fileMatch(
  filename: string,
  pattern: string,
  options?: minimatch.MinimatchOptions,
): boolean {
  return minimatch.minimatch(filename, pattern, options);
}
