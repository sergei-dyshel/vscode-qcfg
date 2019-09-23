'use strict';

import * as nodejs from './nodejs';

export function isSubPath(path: string, subpath: string) {
  return !nodejs.path.relative(path, subpath).startsWith('..');
}

export function stripExt(filename: string) {
  const parsed = nodejs.path.parse(filename);
  return nodejs.path.join(parsed.dir, parsed.name);
}

export function baseName(filename: string) {
  const parsed = nodejs.path.parse(filename);
  return parsed.name;
}
