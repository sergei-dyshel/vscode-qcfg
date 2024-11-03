import { minimatch, MinimatchOptions } from "minimatch";

export function fileMatch(
  filename: string,
  pattern: string,
  options?: MinimatchOptions,
): boolean {
  return minimatch(filename, pattern, options);
}
