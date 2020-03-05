export function defaultCompare(a: string, b: string): number;
export function defaultCompare(a: number, b: number): number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defaultCompare(a: any, b: any): number {
  if (a < b) return -1;
  if (a === b) return 0;
  return 1;
}
