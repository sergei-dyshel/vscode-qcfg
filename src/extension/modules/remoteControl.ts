'use strict';

import * as net from 'net';
import * as path from 'path';
import * as shlex from 'shlex';
import {
  window,
  workspace,
  WorkspaceFolder,
  Position,
  Selection,
  ExtensionContext,
  Uri,
} from 'vscode';
import { handleAsyncStd, handleErrorsAsync } from './exception';
import * as fileUtils from './fileUtils';
import { log, assert } from './logging';
import { Modules } from './module';
import { parseNumber } from '../../library/stringUtils';
import { focusWindow } from './windowState';
import { openRemoteFileViaSsh } from './sshFs';

// eslint-disable-next-line import/no-mutable-exports
export let port = 48123;

async function handleOpen(folder: string, location: string) {
  assert(path.isAbsolute(folder), `"${folder}" is not absolute path`);
  let wsFolder: WorkspaceFolder | undefined;
  let found = false;
  for (wsFolder of workspace.workspaceFolders || [])
    if (wsFolder.uri.fsPath === folder) {
      found = true;
      break;
    }
  if (!wsFolder || !found) {
    log.info(`"${folder}" does not correspond to this workspace's folder`);
    return;
  }

  const [file, line = undefined, column = undefined] = location.split(':');
  if (!file) log.fatal('Filename missing');

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
  const colNo = column === '' ? 1 : parseNumber(column, 1);
  if (lineNo === undefined) return;
  const pos = new Position(lineNo - 1, colNo - 1);

  await window.showTextDocument(Uri.file(fullPath), {
    selection: new Selection(pos, pos),
  });
}

function checkFolder(folder: string) {
  assert(path.isAbsolute(folder), `"${folder}" is not absolute path`);
  for (const wsFolder of workspace.workspaceFolders || [])
    if (wsFolder.uri.fsPath === folder) {
      return true;
    }
  return false;
}

async function handleCmd(cmd: string) {
  const parts = shlex.split(cmd);
  assert(parts.length >= 2, 'Invalid command received', cmd);
  const [opcode, folder, ...args] = parts;
  log.debug(`Received command: ${opcode}, folder: ${folder}, args: ${args}`);

  if (!checkFolder(folder)) {
    log.info(`"${folder}" does not correspond to this workspace's folder`);
    return;
  }
  await focusWindow();

  switch (opcode) {
    case 'open':
      assert(args.length === 1);
      handleAsyncStd(handleOpen(folder, args[0]));
      break;
    case 'openSsh':
      handleAsyncStd(openRemoteFileViaSsh(args[0]));
      break;
    default:
      log.error('Invalid opcode: ' + opcode);
  }
}

function activate(_context: ExtensionContext) {
  const server = net.createServer(socket => {
    socket.on(
      'data',
      handleErrorsAsync(data => handleCmd(data.toString())),
    );
  });
  server.listen(port, '127.0.0.1');
  server.on('listening', () => {
    log.info(`Listening on port ${port}`);
  });
  server.on('error', err => {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EADDRINUSE') {
      log.debug(`Port ${port} already in use`);
      port += 1;
      server.listen(port, '127.0.0.1');
    } else {
      log.info(`Error listening on port ${port}: ${error.message}`);
    }
  });
}

Modules.register(activate);
