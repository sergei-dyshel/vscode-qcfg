import { TextBuffer } from 'superstring';
import { Tree as SyntaxTree } from 'tree-sitter';
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import * as SyntaxParser from 'tree-sitter';

export { SyntaxTree };

export async function parseSyntax(
  text: string,
  langParser: unknown,
): Promise<SyntaxTree> {
  const buf = new TextBuffer(text);
  const parser = getParser();
  parser.setLanguage(langParser);
  const parserAsync = (parser as unknown) as ParserWithAsync;
  try {
    return await parserAsync.parseTextBuffer(buf, undefined, {
      syncOperationCount: 1000,
    });
  } finally {
    putParser(parser);
  }
}

/** Workaround about not being able to export default import */
declare module 'tree-sitter' {
  // eslint-disable-next-line no-shadow
  class Tree {}
  interface Tree {
    version: number;
  }
}

// Private

const parserPool: SyntaxParser[] = [];

function getParser(): SyntaxParser {
  if (!parserPool.isEmpty) return parserPool.pop()!;
  // eslint-disable-next-line new-cap
  const parser = new SyntaxParser.default();
  return parser;
}

function putParser(parser: SyntaxParser) {
  parserPool.push(parser);
}

// parseTextBuffer is missing in tree-sitter definitions
interface ParserWithAsync {
  parseTextBuffer: (
    buf: TextBuffer,
    oldTree?: SyntaxTree,
    config?: {
      syncOperationCount: number;
    },
  ) => Promise<SyntaxTree>;
}
