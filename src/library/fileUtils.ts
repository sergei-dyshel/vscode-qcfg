import * as glob from 'glob';
import * as nodejs from './nodejs';

export const globSync = glob.sync;
export const globAsync: (
  pattern: string,
  options?: glob.IOptions,
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, unicorn/prefer-module
) => Promise<string[]> = nodejs.util.promisify(require('glob'));
