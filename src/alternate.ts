'use strict';

import * as vscode from 'vscode';
import * as fileUtils from './fileUtils';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import * as logging from './logging';

const log = new logging.Logger('alternate');

interface Mapping {
  [ext: string]: string[];
}

function stripExt(filename: string) {
  const parsed = path.parse(filename);
  return path.join(parsed.dir, parsed.name);
}

async function switchToAlternate() {
  const editor = vscode.window.activeTextEditor;
  const document = editor.document;
  const filePath = document.fileName;
  const ext = path.extname(filePath);
  const mapping: Mapping =
      vscode.workspace.getConfiguration('qcfg.alternate').get('mapping');
  if (!(ext in mapping))
    log.fatal(`No alternate mapping configured for ${ext}`);
  const altExts = mapping[ext];
  const altFiles = altExts.map((ext) => stripExt(filePath) + ext);
  for (const alt of altFiles) {
    const exists = await fileUtils.exists(alt);
    if (exists) {
      const altDoc = await vscode.workspace.openTextDocument(alt);
      vscode.window.showTextDocument(altDoc, editor.viewColumn);
      return;
    }
  }
  const relPath = vscode.workspace.asRelativePath(document.fileName);
  vscode.window.showWarningMessage(
      `Alternate file for "${relPath}" does not exist`);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand(
      'qcfg.alternate.switch', switchToAlternate));
}