'use strict';

import {
  SymbolKind,
  TextDocument,
  CancellationToken,
  SymbolInformation,
  Location,
  Position,
  ExtensionContext,
  languages,
  DocumentSymbolProvider,
} from 'vscode';
import { Logger } from '../../library/logging';
import * as subprocess from './subprocess';

import { getActiveTextEditor } from './utils';
import { getDocumentRoot } from './fileUtils';
import { isAnyLangClientRunning } from './langClient';
import { Modules } from './module';
import { stdErrorHandler } from './exception';

interface LanguageConfig {
  lang?: string;
  kinds?: string;
}

const languageConfigs: { [id: string]: LanguageConfig | undefined } = {
  c: {},
  cpp: { lang: 'c++' },
  python: {},
  go: {},
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
  token: CancellationToken,
): Promise<TagInfo[]> {
  const langConfig = languageConfigs[document.languageId];
  const log = new Logger({ instance: document.fileName });
  if (!langConfig) return [];
  const docRoot = getDocumentRoot(document.fileName);
  if (!docRoot) return [];
  const { workspaceFolder, relativePath } = docRoot;
  const proc = new subprocess.Subprocess(
    [
      'ctags',
      '--sort=no',
      `--language-force=${langConfig.lang ?? document.languageId}`,
      '--output-format=json',
      '--fields=*',
      relativePath,
    ],
    { cwd: workspaceFolder.uri.fsPath, maxBuffer: 1 * 1024 * 1024 },
  );
  log.trace('Started');
  token.onCancellationRequested(() => {
    log.trace('Cancelled');
    proc.kill();
  });
  const result = await proc.wait();
  if (token.isCancellationRequested) return [];
  const lines = result.stdout.split('\n');
  const tags = lines.filter(line => line !== '').map(parseLine);
  log.trace(`Returned ${lines.length} results`);
  return tags;
}

function tag2Symbol(tag: TagInfo, document: TextDocument): SymbolInformation {
  const location = new Location(document.uri, new Position(tag.line - 1, 0));
  const kind = ctagsToVscodeKind[tag.kind] ?? SymbolKind.File;
  return new SymbolInformation(tag.name, kind, tag.scope ?? '', location);
}
function parseLine(line: string): TagInfo {
  return JSON.parse(line) as TagInfo;
}

const documentSymbolProvider: DocumentSymbolProvider = {
  async provideDocumentSymbols(
    document: TextDocument,
    token: CancellationToken,
  ): Promise<SymbolInformation[] | undefined> {
    switch (document.languageId) {
      case 'cpp':
      case 'c':
        if (isAnyLangClientRunning()) return;
        break;
      case 'typescript':
        return;
      case 'go':
        break;
    }
    const editor = getActiveTextEditor();
    try {
      const tags = await getTags(editor.document, token);
      return tags.map(tag => tag2Symbol(tag, document));
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
