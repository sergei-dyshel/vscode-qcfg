'use strict';

import * as vscode from 'vscode';
import {window, workspace} from 'vscode';
import * as fileUtils from './fileUtils';
import * as path from 'path';
import { log } from './logging';
import {getActiveTextEditor} from './utils';
import { registerCommandWrapped } from './exception';
import { Modules } from './module';
import { baseName, stripExt } from './pathUtils';

interface Mapping {
  [ext: string]: string[];
}

async function switchToAlternate() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const filePath = document.fileName;
  const relPath = workspace.asRelativePath(document.fileName);
  const ext = path.extname(filePath);
  const mapping: Mapping =
      workspace.getConfiguration('qcfg.alternate').get('mapping', {});
  const altExts = log.assertNonNull(
      mapping[ext], `No alternate mapping configured for ${ext}`);
  const altFiles = altExts.map((ext) => stripExt(filePath) + ext);
  for (const alt of altFiles) {
    const exists = await fileUtils.exists(alt);
    if (exists) {
      window.showTextDocument(
          vscode.Uri.file(alt), {viewColumn: editor.viewColumn});
      return;
    }
  }
  for (const ext of altExts) {
    const shortName = baseName(filePath) + ext;
    const folder = log.assertNonNull(fileUtils.getDocumentWorkspaceFolder(filePath));
    const pattern = new vscode.RelativePattern(folder, '**/' + shortName);
    const files = await workspace.findFiles(pattern);
    if (files.length === 1) {
      window.showTextDocument(files[0], {viewColumn: editor.viewColumn});
      return;
    }
    else if (files.length > 1) {
      window.showWarningMessage(
          `Multiple options for alternate file of "${relPath}"`,
          ...(files.map(uri => uri.fsPath)));
      return;
    }
  }
  window.showWarningMessage(
      `Alternate file for "${relPath}" does not exist`);
}

function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(registerCommandWrapped(
      'qcfg.alternate.switch', switchToAlternate));
}

Modules.register(activate);