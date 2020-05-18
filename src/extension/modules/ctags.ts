'use strict';

import {
  SymbolKind,
  TextDocument,
  CancellationToken,
  ExtensionContext,
  languages,
  DocumentSymbolProvider,
  DocumentSymbol,
} from 'vscode';
import { Logger } from '../../library/logging';
import * as subprocess from './subprocess';

import { getDocumentRoot } from './fileUtils';
import { isAnyLangClientRunning } from './langClient';
import { Modules } from './module';
import { stdErrorHandler } from './exception';
import { adjustRangeInParsedPosition } from './parseLocations';

const C_KINDS =
  'm' /* struct members  */ +
  'p' /* prototypes */ +
  'x'; /* extern variables  */

const CPP_KINDS =
  'A' /* namespace aliases */ +
  'U' /* using namespace */ +
  'N'; /* using scope::symbol */

interface LanguageConfig {
  ctagsLang?: string;
  kinds?: string;
}

const languageConfigs: { [languageId: string]: LanguageConfig | undefined } = {
  c: { kinds: '+' + C_KINDS },
  cpp: { ctagsLang: 'c++', kinds: '+' + C_KINDS + CPP_KINDS },
  python: {},
  go: {},
  javascript: {},
  json: {},
  lua: {},
  makefile: { ctagsLang: 'make' },
  markdown: {},
  shellscript: { ctagsLang: 'sh' },
  typescript: {},
  yaml: {},
};

const ctagsToVscodeKind: { [name: string]: SymbolKind | undefined } = {
  macro: SymbolKind.Constant,
  enumerator: SymbolKind.EnumMember,
  function: SymbolKind.Function,
  enum: SymbolKind.Enum,
  header: SymbolKind.File,
  local: SymbolKind.Variable,
  member: SymbolKind.Field,
  prototype: SymbolKind.Function, // not good
  struct: SymbolKind.Struct,
  typedef: SymbolKind.Class, // not good
  union: SymbolKind.Struct,
  variable: SymbolKind.Variable,
  extervar: SymbolKind.Variable,
  parameter: SymbolKind.Variable,
  // C++ specific
  alias: SymbolKind.Namespace,
  using: SymbolKind.TypeParameter, // not good
  class: SymbolKind.Class,
  namespace: SymbolKind.Namespace,
  // Python specific
  module: SymbolKind.Module,
  unknown: SymbolKind.File, // not good
};

interface TagInfo {
  name: string;
  path: string;
  line: number;
  kind: string;
  scope?: string;
  end: number;
}

async function getTags(
  document: TextDocument,
  token?: CancellationToken,
): Promise<TagInfo[]> {
  const langConfig = languageConfigs[document.languageId];
  const log = new Logger({ instance: document.fileName });
  if (!langConfig) return [];
  const docRoot = getDocumentRoot(document.fileName);
  if (!docRoot) return [];
  const { workspaceFolder, relativePath } = docRoot;
  const lang = langConfig.ctagsLang ?? document.languageId;
  const kindsArg = langConfig.kinds
    ? [`--kinds-${lang}=${langConfig.kinds}`]
    : [];
  const proc = new subprocess.Subprocess(
    [
      'ctags',
      '--sort=no',
      `--language-force=${lang}`,
      '--output-format=json',
      '--fields=*',
    ].concat(kindsArg, [relativePath]),
    { cwd: workspaceFolder.uri.fsPath, maxBuffer: 1 * 1024 * 1024 },
  );
  log.trace('Started');
  if (token)
    token.onCancellationRequested(() => {
      log.trace('Cancelled');
      proc.kill();
    });
  const result = await proc.wait();
  if (token?.isCancellationRequested) return [];
  const lines = result.stdout.split('\n');
  const tags = lines.filter((line) => line !== '').map(parseLine);
  log.trace(`Returned ${lines.length} results`);
  return tags;
}

export async function getDocumentSymbolsFromCtags(
  document: TextDocument,
  token?: CancellationToken,
) {
  const tags = await getTags(document, token);
  return tags.map((tag) => tag2Symbol(tag, document));
}

function tag2Symbol(tag: TagInfo, document: TextDocument): DocumentSymbol {
  const regexp = new RegExp('\\b' + tag.name + '\\b');
  const range = adjustRangeInParsedPosition(
    document,
    document.lineAt(tag.line - 1).range.start,
    regexp,
  );
  const kind = ctagsToVscodeKind[tag.kind] ?? SymbolKind.File;
  return new DocumentSymbol(tag.name, tag.scope ?? '', kind, range, range);
}

function parseLine(line: string): TagInfo {
  return JSON.parse(line) as TagInfo;
}

const documentSymbolProvider: DocumentSymbolProvider = {
  async provideDocumentSymbols(
    document: TextDocument,
    token: CancellationToken,
  ): Promise<DocumentSymbol[] | undefined> {
    switch (document.languageId) {
      case 'cpp':
      case 'c':
        if (isAnyLangClientRunning()) return;
        break;
      case 'typescript':
        return;
      case 'go':
        return;
    }
    try {
      return await getDocumentSymbolsFromCtags(document, token);
    } catch (err) {
      stdErrorHandler(err);
    }
  },
};

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerDocumentSymbolProvider('*', documentSymbolProvider),
  );
}

Modules.register(activate);
