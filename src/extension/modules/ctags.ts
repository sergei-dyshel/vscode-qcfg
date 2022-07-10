import type {
  CancellationToken,
  DocumentSymbolProvider,
  ExtensionContext,
  TextDocument,
} from 'vscode';
import { DocumentSymbol, languages, Location, SymbolKind } from 'vscode';
import { Logger } from '../../library/logging';
import { getDocumentRoot } from '../utils/document';
import { registerAsyncCommandWrapped, stdErrorHandler } from './exception';
import { getGtagsDefinitionsInWorkspace } from './gtags';
import { isAnyLangClientRunning } from './langClient';
import { Modules } from './module';
import { adjustRangeInParsedPosition } from './parseLocations';
import { saveAndPeekSearch } from './savedSearch';
import * as subprocess from './subprocess';
import { getCursorWordContext } from './utils';

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

const languageConfigs: Record<string, LanguageConfig | undefined> = {
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

const ctagsToVscodeKind: Record<string, SymbolKind | undefined> = {
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
      ...kindsArg,
      relativePath,
    ],
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
  let pattern: RegExp | string = tag.name;
  try {
    pattern = new RegExp('\\b' + tag.name + '\\b');
  } catch {
    // tag.name is not alhpa-numberic literal
  }
  const range = adjustRangeInParsedPosition(
    document,
    document.lineAt(tag.line - 1).range.start,
    pattern,
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
    } catch (err: unknown) {
      stdErrorHandler(err);
    }
  },
};

async function getCtagsDefinitions(document: TextDocument, word: string) {
  const symbols = await getDocumentSymbolsFromCtags(document);
  return symbols
    .filter((symbol) => symbol.name === word)
    .map((symbol) => new Location(document.uri, symbol.selectionRange));
}

async function getGtagsCtagsDefinitions() {
  const ctx = getCursorWordContext()!;
  const { word, editor, location } = ctx;
  return saveAndPeekSearch(
    `ctags/gtags for ${word}`,
    async () => {
      const [gtagsDefs, ctagsDefs] = await Promise.all([
        getGtagsDefinitionsInWorkspace(),
        getCtagsDefinitions(editor.document, word),
      ]);
      return [...gtagsDefs, ...ctagsDefs];
    },
    location,
  );
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    languages.registerDocumentSymbolProvider('*', documentSymbolProvider),
    registerAsyncCommandWrapped(
      'qcfg.search.GtagsCtagsDefinition',
      getGtagsCtagsDefinitions,
    ),
  );
}

Modules.register(activate);
