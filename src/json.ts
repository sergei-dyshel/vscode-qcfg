'use strict';

import * as jsoncParser from 'jsonc-parser';
import * as nodejs from './nodejs';
import { Uri, workspace } from 'vscode';

interface JsonParseOptions extends jsoncParser.ParseOptions {
  forbidErrors?: boolean;
}

class JsonParseError extends Error {
  constructor(message: string, public errors: jsoncParser.ParseError[]) {
    super(message);
  }
}

export function parseJson(text: string, options?: JsonParseOptions) {
  const errors: jsoncParser.ParseError[] = [];
  const json = jsoncParser.parse(text, errors, options);
  if (errors.length > 0 && options && options.forbidErrors)
    throw new JsonParseError('Errors occured while parsing JSON', errors);
  return json;
}

export function parseJsonFileSync(
  path: string,
  options?: JsonParseOptions,
): unknown {
  return parseJson(nodejs.fs.readFileSync(path).toString(), options);
}

export async function parseJsonFileAsync(
  path: string,
  options?: JsonParseOptions,
): Promise<unknown> {
  return parseJson(
    (await workspace.fs.readFile(Uri.file(path))).toString(),
    options,
  );
}
