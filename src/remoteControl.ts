'use strict';

import * as vscode from 'vscode';
import {window, workspace, commands} from 'vscode';

import * as net from 'net';
import * as path from 'path';

import * as shlex from 'shlex';

import * as terminal from './terminal';
import {Logger, str} from './logging';
import * as fileUtils from './fileUtils';
import {getActiveTextEditor} from './utils';
import {parseNumber} from './stringUtils';

const log = Logger.create('remote');

export let port = 48123;

async function handleOpen(location: string, folder: string) {
  if (folder && !path.isAbsolute(folder))
    log.fatal(`"${folder}" is not absolute path`);
  let wsFolder: vscode.WorkspaceFolder | undefined;
  let found = false;
  for (wsFolder of (workspace.workspaceFolders || []))
    if (wsFolder.uri.fsPath === folder) {
      found = true;
      break;
    }
  if (!wsFolder || !found) {
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
  const lineNo = parseNumber(line);
  const colNo = column === "" ? 1 : parseNumber(column, 1);
  if (lineNo === undefined)
    return;
  const pos = new vscode.Position(lineNo - 1, colNo - 1);

  let editor = getActiveTextEditor();
  let document = editor.document;
  const selection = new vscode.Selection(pos, pos);
  if (document.uri.fsPath !== fullPath) {
    document = await workspace.openTextDocument(fullPath);
    editor = await window.showTextDocument(document, {selection});
    editor.show();
    return;
  }
  editor.selection = selection;
  editor.revealRange(editor.selection);
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
      log.assert(args.length === 2);
      handleOpen(args[0], args[1]);
      break;
    case 'terminalProcessExit':
      terminal.processExit(args);
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
      log.info(`Port ${port} already in use`);
      port++;
      server.listen(port, '127.0.0.1');
    } else {
      log.info(`Error listening on port ${port}: ${error.message}`);
    }
  });
}