'use strict';

import {
  window,
  workspace,
  Uri,
  RelativePattern,
  ExtensionContext,
} from 'vscode';
import * as fileUtils from './fileUtils';
import * as path from 'path';
import { getActiveTextEditor } from './utils';
import { registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';
import { baseName, stripExt } from '../../library/pathUtils';
import { selectFromList } from './dialog';
import * as nodejs from '../../library/nodejs';
import { assertNonNull } from '../../library/exception';

interface Mapping {
  [ext: string]: string[];
}

async function switchToAlternate() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const filePath = document.fileName;
  const relPath = workspace.asRelativePath(document.fileName);
  const ext = path.extname(filePath);
  const mapping: Mapping = workspace
    .getConfiguration('qcfg.alternate')
    .get('mapping', {});
  const altExts = assertNonNull(
    mapping[ext],
    `No alternate mapping configured for ${ext}`,
  );
  const altFiles = altExts.map((altExt) => stripExt(filePath) + altExt);
  for (const alt of altFiles) {
    const exists = await fileUtils.exists(alt);
    if (!exists) continue;
    await window.showTextDocument(Uri.file(alt), {
      viewColumn: editor.viewColumn,
    });
    return;
  }
  for (const altExt of altExts) {
    const shortName = baseName(filePath) + altExt;
    const folder = assertNonNull(
      fileUtils.getDocumentWorkspaceFolder(filePath),
    );
    const pattern = new RelativePattern(folder, '**/' + shortName);
    const files = await workspace.findFiles(pattern);
    if (files.length === 0) {
      continue;
    }
    if (files.length === 1) {
      await window.showTextDocument(files[0], {
        viewColumn: editor.viewColumn,
      });
      return;
    }
    const file = await selectFromList(files, (uri) => ({
      label: nodejs.path.relative(folder.uri.fsPath, uri.fsPath),
    }));
    if (file) {
      await window.showTextDocument(file, {
        viewColumn: editor.viewColumn,
      });
    }
    return;
  }
  await window.showWarningMessage(
    `Alternate file for "${relPath}" does not exist`,
  );
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.alternate.switch', switchToAlternate),
  );
}

Modules.register(activate);
