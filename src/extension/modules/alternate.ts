import type { ExtensionContext } from 'vscode';
import { RelativePattern, Uri, window, workspace } from 'vscode';
import { assertNotNull } from '../../library/exception';
import * as nodejs from '../../library/nodejs';
import { baseNameNoExt, stripExt } from '../../library/pathUtils';
import { getConfiguration } from '../utils/configuration';
import { getDocumentWorkspaceFolder } from '../utils/document';
import { GenericQuickPick } from '../utils/quickPick';
import { registerAsyncCommandWrapped } from './exception';
import { fileExists } from './fileUtils';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';

async function switchToAlternate() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const filePath = document.fileName;
  const relPath = workspace.asRelativePath(document.fileName);
  const ext = nodejs.path.extname(filePath);
  const mapping = getConfiguration().getNotNull('qcfg.alternate.mapping');
  const altExts = mapping[ext];
  assertNotNull(altExts, `No alternate mapping configured for ${ext}`);
  const altFiles = altExts.map((altExt) => stripExt(filePath) + altExt);
  for (const alt of altFiles) {
    const exists = await fileExists(alt);
    if (!exists) continue;
    await window.showTextDocument(Uri.file(alt), {
      viewColumn: editor.viewColumn,
    });
    return;
  }
  for (const altExt of altExts) {
    const shortName = baseNameNoExt(filePath) + altExt;
    const folder = getDocumentWorkspaceFolder(filePath);
    assertNotNull(folder);
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
    const qp = new GenericQuickPick(
      (uri) => ({
        label: nodejs.path.relative(folder.uri.fsPath, uri.fsPath),
      }),
      files,
    );
    const file = await qp.select();
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
