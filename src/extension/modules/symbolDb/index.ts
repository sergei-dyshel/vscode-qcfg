'use strict';

import type { CancellationToken, ExtensionContext, Progress } from 'vscode';
import { Position, ProgressLocation, Range, window, workspace } from 'vscode';
import { assertNotNull } from '../../../library/exception';
import { log } from '../../../library/logging';
import type { SyntaxSymbol } from '../../../library/syntax';
import { SyntaxLanguage } from '../../../library/syntax';
import { AsyncMapper } from '../async';
import { selectFromList } from '../dialog';
import {
  executeCommandHandled,
  handleAsyncStd,
  registerAsyncCommandWrapped,
} from '../exception';
import { clangdWrapper } from '../langClient';
import { detectLanguage } from '../language';
import { Modules } from '../module';
import { searchInFiles } from '../search';
import { currentWorkspaceFolder, getActiveTextEditor } from '../utils';
import { preserveActiveLocation } from '../windowUtils';

async function listFilesInWorkspace() {
  const matches = await searchInFiles(
    {
      pattern: '\\A',
      isRegExp: true,
      isMultiline: true,
    },
    {
      useIgnoreFiles: true,
      useDefaultExcludes: true,
      useGlobalIgnoreFiles: true,
      followSymlinks: false,
    },
  );
  return matches.map((loc) => loc.uri);
}

async function createDb() {
  const folder = currentWorkspaceFolder();
  assertNotNull(folder);
  const files = await listFilesInWorkspace();
  await window.withProgress(
    { location: ProgressLocation.Notification, title: 'SymbolDB' },
    async (
      progress: Progress<{ message?: string; increment?: number }>,
      _: CancellationToken,
    ): Promise<void> => {
      let cnt = 0;
      const mapper = new AsyncMapper(50);
      for (const uri of files) {
        mapper.add(async () => {
          const path = workspace.asRelativePath(uri);
          const lang = await detectLanguage(uri.fsPath);
          log.debug(`Parsing ${path} (${lang})`);
          try {
            const symbols = await clangdWrapper.getDocumentSymbols(uri);
            if (symbols) log.debug(`${path}: ${symbols.length} symbols`);
          } catch (err: unknown) {
            log.debug(`${path}: ${err}`);
          }
          // const symbols = await executeDocumentSymbolProvider(uri);
          cnt += 1;
          const percent = (cnt * 100) / files.length;
          progress.report({
            message: `${cnt}/${files.length}`,
            increment: percent,
          });
        });
        // if (lang && SyntaxLanguage.isSupported(lang)) {
        //   const slang = SyntaxLanguage.get(lang);
        //   const fileText = await readFile(uri.fsPath);
        //   const tree = await slang.parse(fileText);
        //   const symbols = slang.getSymbols(tree.rootNode);
        //   log.debug(`Found ${symbols.length} symbols`);
        // }
      }
      await mapper.run();
    },
  );
  executeCommandHandled('qcfg.log.show');
}

function convertPosition(pos: SyntaxSymbol.Position): Position {
  return new Position(pos.row - 1, pos.column - 1);
}

function convertRange(range: SyntaxSymbol.Range): Range {
  return new Range(convertPosition(range.start), convertPosition(range.end));
}

async function showDocumentSymbols() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const slang = SyntaxLanguage.get(document.languageId);
  const tree = await slang.parse(document.getText());
  const symbols = slang.getSymbols(tree.rootNode);
  const selectedSymbolPromise = selectFromList<SyntaxSymbol>(
    symbols,
    (symbol) => ({
      label: symbol.name,
      description: symbol.type,
    }),
    {},
    (symbol) => {
      handleAsyncStd(
        window.showTextDocument(editor.document, {
          preserveFocus: true,
          selection: convertRange(symbol.nameRange),
        }),
      );
      // editor.revealRange(convertRange(symbol.range));
      // editor.revealRange(convertRange(symbol.nameRange));
    },
  );
  await preserveActiveLocation(selectedSymbolPromise);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.symbols.createDb', createDb),
    registerAsyncCommandWrapped('qcfg.symbols.show', showDocumentSymbols),
  );
}

Modules.register(activate);
