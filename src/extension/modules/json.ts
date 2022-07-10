import * as jsoncParser from 'jsonc-parser';
import { Uri, workspace } from 'vscode';
import * as nodejs from '../../library/nodejs';

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
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
  const fileData = await workspace.fs.readFile(Uri.file(path));
  return parseJson(fileData.toString(), options);
}
