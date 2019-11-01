'use strict';

import * as jsoncParser from 'jsonc-parser';
import * as nodejs from './nodejs';

interface JsonParseOptions extends jsoncParser.ParseOptions {
  forbidErrors?: boolean;
}

class JsonParseError extends Error {
  constructor(message: string, public errors: jsoncParser.ParseError[]) {
    super(message);
  }
}

export function parseJsonFileSync(
  path: string,
  options?: JsonParseOptions
): any {
  const errors: jsoncParser.ParseError[] = [];
  const json = jsoncParser.parse(
    nodejs.fs.readFileSync(path).toString(),
    errors,
    options
  );
  if (errors.length > 0 && options && options.forbidErrors)
    throw new JsonParseError('Errors occured while parsing JSON', errors);
  return json;
}
