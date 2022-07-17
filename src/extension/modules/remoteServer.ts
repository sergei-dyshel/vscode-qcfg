/* eslint-disable @typescript-eslint/no-explicit-any */
import * as jayson from 'jayson/promise';
import type { ExtensionContext } from 'vscode';
import { commands, Position, Uri, window, workspace } from 'vscode';
import { log } from '../../library/logging';
import { PORT_RANGE } from '../../library/remoteClient';
import { stringify } from '../../library/stringify';
import { mapObjectValues } from '../../library/tsUtils';
import { openFolder } from '../utils/window';
import { ConfigSectionWatcher } from './configWatcher';
import {
  handleAsyncStd,
  handleErrors,
  registerSyncCommandWrapped,
} from './exception';
import { Modules } from './module';
import { openRemoteFileViaSsh } from './sshFs';
import { focusWindow } from './windowState';
import { getWorkspaceFile, getWorkspaceName } from './workspaceHistory';

export type RemoteProtocol = typeof protocol;

let port = 0;

export interface IdentifyResult {
  workspaceFile: string | undefined;
  workspaceName: string | undefined;
  workspaceFolders: string[] | undefined;
  setDefaultTimestamp: number;
}

const protocol = {
  // eslint-disable-next-line @typescript-eslint/require-await
  async identify(_: Record<string, unknown>) {
    return {
      workspaceFile: getWorkspaceFile(),
      workspaceName: getWorkspaceName(),
      workspaceFolders: workspace.workspaceFolders?.map(
        (folder) => folder.uri.fsPath,
      ),
      setDefaultTimestamp: lastSetDefaultTimestamp,
    };
  },
  async openFile(arg: {
    path: string;
    line?: number;
    column?: number;
  }): Promise<void> {
    const selection =
      arg.line !== undefined
        ? new Position(
            arg.line - 1,
            (arg.column ?? 1) - 1,
          ).asRange.asSelection()
        : undefined;
    focusWindow();
    await window
      .showTextDocument(Uri.file(arg.path), { selection })
      .ignoreResult();
  },

  async openSsh(arg: { path: string }): Promise<void> {
    focusWindow();
    await openRemoteFileViaSsh(arg.path);
  },

  async executeCommand(args: { name: string }): Promise<void> {
    return commands.executeCommand(args.name);
  },

  async openFolder(args: { path: string }): Promise<void> {
    return openFolder(args.path, true /* newWindow */).ignoreResult();
  },

  // eslint-disable-next-line @typescript-eslint/require-await
  async reloadWindow(_: Record<string, unknown>) {
    setTimeout(() => {
      handleAsyncStd(commands.executeCommand('workbench.action.reloadWindow'));
    }, 1000);
  },
};

type Handler = (arg: any) => any;

type AbstractProtocol = Record<string, Handler>;

let lastSetDefaultTimestamp = 0;

function setDefaultServer() {
  lastSetDefaultTimestamp = Date.now();
}

function activate(context: ExtensionContext) {
  const loggedProtocol: AbstractProtocol = mapObjectValues(
    protocol as AbstractProtocol,
    (name, handler) =>
      handleErrors((arg: any) => {
        log.info(`Received request "${name}" with arguments ${stringify(arg)}`);
        return handler(arg);
      }),
  );
  const server = new jayson.Server(loggedProtocol);
  const tcpServer = server.tcp();
  port = PORT_RANGE[0];
  tcpServer.listen(port, '127.0.0.1');
  tcpServer.on('listening', () => {
    log.info(`TCP server started on port ${port}`);
  });
  tcpServer.on('error', (err) => {
    const error = err as NodeJS.ErrnoException;
    if (error.code === 'EADDRINUSE') {
      log.debug(`Port ${port} already in use`);
      port += 1;
      if (!PORT_RANGE.includes(port)) {
        port = 0;
        log.error('Remote server port out of range');
      }
      tcpServer.listen(port, '127.0.0.1');
    } else {
      log.info(`Error listening on port ${port}: ${error.message}`);
    }
  });

  const watcher = new ConfigSectionWatcher('qcfg.remote.setDefault', () => {
    if (watcher.value) setDefaultServer();
    else lastSetDefaultTimestamp = 0;
  });
  context.subscriptions.push(
    // eslint-disable-next-line sonarjs/no-duplicate-string
    registerSyncCommandWrapped('qcfg.remote.setDefault', setDefaultServer),
    watcher.register(),
  );
}

Modules.register(activate);
