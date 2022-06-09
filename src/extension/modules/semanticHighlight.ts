import type {
  ExtensionContext,
  SemanticTokens,
  SemanticTokensLegend,
  TextDocument,
  Uri,
} from 'vscode';
import { commands, Position, Range } from 'vscode';
import { log } from '../../library/logging';
import { arraySlice, numberToBitArray } from '../../library/tsUtils';
import {
  executeCommandHandled,
  registerAsyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';

async function provideDocumentSemanticTokensLegend(uri: Uri) {
  return commands.executeCommand<SemanticTokensLegend>(
    'vscode.provideDocumentSemanticTokensLegend',
    uri,
  );
}

async function provideDocumentSemanticTokens(uri: Uri) {
  return commands.executeCommand<SemanticTokens>(
    'vscode.provideDocumentSemanticTokens',
    uri,
  );
}

interface DecodedToken {
  range: Range;
  text: string;
  type: string;
  modifiers: string[];
}

function decodeToken(
  document: TextDocument,
  tokens: SemanticTokens,
  index: number,
  legend: SemanticTokensLegend,
  prevToken?: DecodedToken,
): DecodedToken {
  const [deltaLine, deltaChar, length, tokenType, tokenModifiers] = arraySlice(
    tokens.data,
    index,
    index + 5,
  );

  let line = prevToken?.range.start.line ?? 0;
  let char = prevToken?.range.start.character ?? 0;

  line += deltaLine;
  if (deltaLine > 0) char = 0;
  char += deltaChar;

  const range = new Range(
    new Position(line, char),
    new Position(line, char + length),
  );

  const type = legend.tokenTypes[tokenType];
  const modifiers = numberToBitArray(tokenModifiers)
    .allIndexesOf(1)
    .map((i) => legend.tokenModifiers[i]);
  return {
    range,
    text: document.getText(range),
    type,
    modifiers,
  };
}

async function dumpSemanticTokens() {
  const editor = getActiveTextEditor();
  const uri = editor.document.uri;
  const legend = await provideDocumentSemanticTokensLegend(uri);
  const tokens = await provideDocumentSemanticTokens(uri);
  for (const token of decodeAllTokens(
    editor.document,
    tokens,
    legend,
    editor.selection,
  )) {
    const { text, type, modifiers } = token;
    log.info({ text, type, modifiers });
  }
  executeCommandHandled('qcfg.log.show');
}

function decodeAllTokens(
  document: TextDocument,
  tokens: SemanticTokens,
  legend: SemanticTokensLegend,
  range?: Range,
): DecodedToken[] {
  let token: DecodedToken;
  const allTokens: DecodedToken[] = [];
  const docStart = new Position(0, 0);
  const docEnd = document.lineAt(document.lineCount - 1).range.end;
  for (let i = 0; i < tokens.data.length; i += 5) {
    token = decodeToken(document, tokens, i, legend, token!);
    if (token.range.end.isBeforeOrEqual(range?.start ?? docStart)) continue;
    if (token.range.start.isAfterOrEqual(range?.end ?? docEnd)) break;
    allTokens.push(token);
  }
  return allTokens;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped(
      'qcfg.semanticHighlight.dump',
      dumpSemanticTokens,
    ),
  );
}

Modules.register(activate);
