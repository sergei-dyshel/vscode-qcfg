import * as jsoncParser from "jsonc-parser";
import { Selection, Uri, window, workspace } from "vscode";
import * as nodejs from "../../library/nodejs";
import { documentText } from "./documentUtils";

interface JsonParseOptions extends jsoncParser.ParseOptions {
  forbidErrors?: boolean;
}

class JsonParseError extends Error {
  constructor(
    message: string,
    public errors: jsoncParser.ParseError[],
  ) {
    super(message);
  }
}

export function parseJson(text: string, options?: JsonParseOptions) {
  const errors: jsoncParser.ParseError[] = [];
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const json = jsoncParser.parse(text, errors, options);
  if (errors.length > 0 && options && options.forbidErrors)
    throw new JsonParseError("Errors occured while parsing JSON", errors);
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

/**
 * Open JSON file and select node corresponding to given path.
 */
export async function editJsonPath(uri: Uri, path: jsoncParser.JSONPath) {
  const editor = await window.showTextDocument(uri);
  const document = editor.document;
  const text = documentText(document);
  const tree = jsoncParser.parseTree(text, undefined /* errors */, {
    allowTrailingComma: true,
  });
  const node = jsoncParser.findNodeAtLocation(tree, path);
  if (!node) {
    const pathStr = path.join("/");
    throw new Error(`Could not find ${pathStr} in ${uri}`);
  }
  const anchor = document.positionAt(node.offset);
  editor.selection = new Selection(anchor, anchor);
  editor.revealRange(editor.selection);
}
