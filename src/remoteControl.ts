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
import { handleErrors, handleAsyncStd } from './exception';
import * as fileUtils from './fileUtils';
import { log } from './logging';
import { Modules } from './module';
import { parseNumber } from './stringUtils';
import { focusWindow } from './windowState';

// eslint-disable-next-line import/no-mutable-exports
export let port = 48123;

async function handleOpen(location: string, folder: string) {
  log.assert(path.isAbsolute(folder), `"${folder}" is not absolute path`);
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
  await focusWindow();
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
      handleAsyncStd(handleOpen(args[0], args[1]));
      break;
    default:
      log.error('Invalid opcode: ' + opcode);
  }
}

function activate(_context: ExtensionContext) {
  const server = net.createServer(socket => {
    socket.on(
      'data',
      handleErrors(data => {
        handleCmd(data.toString());
      }),
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
