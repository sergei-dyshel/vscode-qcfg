'use strict';

import * as vscode from 'vscode';
import {window, workspace, commands} from 'vscode';

import * as net from 'net';
import * as path from 'path';

import * as shlex from 'shlex';

import {Logger, str} from './logging';
import * as fileUtils from './fileUtils';

const log = new Logger('remote');

export let port = 48123;

function parseNumber(s: string, default_?: number): number {
  if (s === undefined)
    return default_;
  const num = Number(s);
  if (isNaN(num) || s === "")
    log.fatal(`${s} is not a number`);
  return num;
}

async function handleOpen(folder?: string, location?: string) {
  if (!path.isAbsolute(folder))
    log.fatal(`"${folder}" is not absolute path`);
  let wsFolder: vscode.WorkspaceFolder;
  for (wsFolder of workspace.workspaceFolders)
    if (wsFolder.uri.fsPath === folder)
      break;
  if (!wsFolder) {
    log.info(`"${folder}" does not correspond to this workspace's folder`);
    return;
  }
  const [file, line = undefined, column = undefined, ...rest] =
      location.split(':');
  if (!file)
    log.fatal('Filename missing');

  let fullPath: string;
    if (path.isAbsolute(file)) {
    if (!file.startsWith(folder))
      log.fatal(`File "${file}" does not belong to "${wsFolder.name}"`);
    fullPath = file;
  } else {
    fullPath = path.join(wsFolder.uri.fsPath, file);
    const fileExists = await fileUtils.exists(fullPath);
    if (!fileExists)
      log.fatal(`File "${file}" does not exist in "${wsFolder.name}"`);
  }
  let editor = window.activeTextEditor;
  let document = editor.document;
  if (document.uri.fsPath !== fullPath) {
    document = await workspace.openTextDocument(fullPath);
    editor = await window.showTextDocument(document);
  }
  const lineNo = parseNumber(line);
  const colNo = column === "" ? 1 : parseNumber(column, 1);
  if (lineNo === undefined)
    return;
  const pos = new vscode.Position(lineNo - 1, colNo - 1);
  editor.selection = new vscode.Selection(pos, pos);
  editor.revealRange(editor.selection);
  editor.show();
}

function handleCmd(cmd: string) {
  const parts = shlex.split(cmd);
  if (!parts.length) {
    log.warn('Empty command received');
    return;
  }
  log.debug(`Received command: ${cmd}`);
  const opcode = parts[0];
  const args = parts.slice(1);
  switch (opcode) {
    case 'open':
      handleOpen(...args);
      break;
    default:
      log.error('Invalid opcode: ' + opcode);
  }
}

export function activate(context: vscode.ExtensionContext) {
  const server = net.createServer((socket) => {
    socket.on('data', (data) => {
      handleCmd(data.toString());
    });
  });
  server.listen(port, '127.0.0.1');
  server.on('listening', () => {
    log.info(`Listening on port ${port}`);
  });
  server.on('error', (err) => {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EADDRINUSE') {
      log.warn(`Port ${port} already in use`);
      port++;
      server.listen(port, '127.0.0.1');
    } else {
      log.info(`Error listening on port ${port}: ${error.message}`);
    }
  });
}