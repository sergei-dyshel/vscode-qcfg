export function defaultCompare<T>(a: T, b: T): number {
  if (a < b) return -1;
  if (a === b) return 0;
  return 1;
}
