'use strict';

import * as vscode from 'vscode';
import {SymbolKind} from 'vscode';
import * as logging from './logging';
import * as subprocess from './subprocess';

import {getActiveTextEditor} from './utils';
import {getDocumentRoot} from './fileUtils';
import {isLspActive} from './language';

const log = logging.Logger.create('ctags');

interface LanguageConfig {
  lang?: string;
  kinds?: string;
}

const languageConfigs: {[id: string]: LanguageConfig} = {
  c: {},
  cpp: {lang: 'c++'},
  python: {}
};

const ctagsToVscodeKind: {[name: string]: SymbolKind} = {
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

function showTags() {
  const editor = getActiveTextEditor();
  const filePath = editor.document.fileName;

}

interface TagInfo {
  name: string;
  path: string;
  line: number;
  kind: string;
  scope?: string;
  end: number;
}

async function getTags(
    document: vscode.TextDocument,
    token: vscode.CancellationToken): Promise<TagInfo[]> {
  const langConfig = languageConfigs[document.languageId];
  if (!langConfig)
      return [];
  const {wsFolder, relPath} = getDocumentRoot(document);
  const proc = new subprocess.Subprocess(
      [
        'ctags', '--sort=no',
        `--language-force=${langConfig.lang || document.languageId}`,
        '--output-format=json', '--fields=*', relPath
      ],
      {cwd: wsFolder.uri.fsPath, maxBuffer: 1 * 1024 * 1024});
  log.debug('Started');
  token.onCancellationRequested(() => {
    log.debug('Cancelled');
    proc.kill();
  });
  const result = await proc.wait();
  if (token.isCancellationRequested)
    return [];
  const lines = result.stdout.split('\n');
  const tags = lines.filter((line) => line !== '').map(parseLine);
  log.debug(`Returned ${lines.length} results`);
  return tags;
}

function tag2Symbol(tag: TagInfo, document: vscode.TextDocument): vscode.SymbolInformation {
  const location =
      new vscode.Location(document.uri, new vscode.Position(tag.line - 1, 0));
  const kind = ctagsToVscodeKind[tag.kind] || SymbolKind.File;
  return new vscode.SymbolInformation(
      tag.name, kind, tag.scope || '', location);
}
function parseLine(line: string): TagInfo {
  return JSON.parse(line) as TagInfo;
}

class DocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  async provideDocumentSymbols(
      document: vscode.TextDocument, token: vscode.CancellationToken):
      Promise<vscode.SymbolInformation[]|undefined> {
    switch (document.languageId) {
      case 'cpp':
      case 'c':
        if (isLspActive())
          return;
        break;
      case 'typescript':
        return;
    }
    const editor = getActiveTextEditor();
    const tags = await getTags(editor.document, token);
    const symbols = tags.map(tag => tag2Symbol(tag, document));
    return symbols;
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(
      vscode.commands.registerCommand('qcfg.ctags.show', showTags),
      vscode.languages.registerDocumentSymbolProvider(
          '*', new DocumentSymbolProvider()));
}