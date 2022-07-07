export type NonEmptyArray<T> = [T, ...T[]];

export type NonEmptyReadOnlyArray<T> = readonly [T, ...(readonly T[])];

export function isNonEmpty<T>(array: T[]): array is NonEmptyArray<T>;
export function isNonEmpty<T>(
  array: readonly T[],
): array is NonEmptyReadOnlyArray<T>;
export function isNonEmpty<T>(array: readonly T[]) {
  return array.length > 0;
}
