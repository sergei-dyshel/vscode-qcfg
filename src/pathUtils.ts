'use strict';

import * as nodejs from './nodejs';

export function isSubPath(path: string, subpath: string) {
  return !nodejs.path.relative(path, subpath).startsWith('..');
}