'use strict';

import * as vscode from 'vscode';
import {window, workspace, TextEditor} from 'vscode';
import * as fileUtils from './fileUtils';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import * as logging from './logging';
import {getActiveTextEditor} from './utils';

const log = logging.Logger.create('alternate');

interface Mapping {
  [ext: string]: string[];
}

function stripExt(filename: string) {
  const parsed = path.parse(filename);
  return path.join(parsed.dir, parsed.name);
}

async function switchToAlternate() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const filePath = document.fileName;
  const ext = path.extname(filePath);
  const mapping: Mapping =
      workspace.getConfiguration('qcfg.alternate').get('mapping', {});
  if (!(ext in mapping))
    log.fatal(`No alternate mapping configured for ${ext}`);
  const altExts = mapping[ext];
  const altFiles = altExts.map((ext) => stripExt(filePath) + ext);
  for (const alt of altFiles) {
    const exists = await fileUtils.exists(alt);
    if (exists) {
      const altDoc = await workspace.openTextDocument(alt);
      window.showTextDocument(altDoc, editor.viewColumn);
      return;
    }
  }
  const relPath = workspace.asRelativePath(document.fileName);
  window.showWarningMessage(
      `Alternate file for "${relPath}" does not exist`);
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand(
      'qcfg.alternate.switch', switchToAlternate));
}