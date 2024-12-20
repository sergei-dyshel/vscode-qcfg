import * as glob from "glob";
import * as nodejs from "./nodejs";

export const globSync = glob.sync;
export const globAsync: (
  pattern: string,
  options?: glob.IOptions,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, unicorn/prefer-module
) => Promise<string[]> = nodejs.util.promisify(require("glob"));

export const statAsync = nodejs.util.promisify(nodejs.fs.stat);

export const readDirectory = nodejs.util.promisify(nodejs.fs.readdir);

export async function isDirectory(path: string): Promise<boolean> {
  const stat = await statAsync(path);
  return stat.isDirectory();
}

export async function isFile(path: string): Promise<boolean> {
  const stat = await statAsync(path);
  return stat.isFile();
}

export function isDirectorySync(path: string): boolean {
  const stat = nodejs.fs.statSync(path);
  return stat.isDirectory();
}

export function isFileSync(path: string): boolean {
  const stat = nodejs.fs.statSync(path);
  return stat.isFile();
}

export const fileExists = nodejs.util.promisify(nodejs.fs.exists);
export const realPath = nodejs.util.promisify(nodejs.fs.realpath);
