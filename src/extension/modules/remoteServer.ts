/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  ExtensionContext,
  workspace,
  Position,
  window,
  Uri,
  commands,
} from 'vscode';
import * as jayson from 'jayson/promise';
import { PORT_RANGE } from '../../library/remoteClient';
import { getWorkspaceFile, getWorkspaceName } from './workspaceHistory';
import { mapObjectValues } from '../../library/tsUtils';
import { Modules } from './module';
import { log } from '../../library/logging';
import { focusWindow } from './windowState';
import { stringify } from '../../library/stringify';
import { handleAsyncStd } from './exception';
import { openRemoteFileViaSsh } from './sshFs';

export type RemoteProtocol = typeof protocol;

let port = 0;

export interface IdentifyResult {
  workspaceFile: string | undefined;
  workspaceName: string | undefined;
  workspaceFolders: string[] | undefined;
}

const protocol = {
  async identify(_: {}): Promise<IdentifyResult> {
    return Promise.resolve({
      workspaceFile: getWorkspaceFile(),
      workspaceName: getWorkspaceName(),
      workspaceFolders: workspace.workspaceFolders?.map(
        (folder) => folder.uri.fsPath,
      ),
    });
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
    await Promise.all([
      focusWindow(),
      window.showTextDocument(Uri.file(arg.path), { selection }).ignoreResult(),
    ]);
  },

  async openSsh(arg: { path: string }): Promise<void> {
    await Promise.all([focusWindow(), openRemoteFileViaSsh(arg.path)]);
  },

  async executeCommand(args: { name: string }): Promise<void> {
    return commands.executeCommand(args.name);
  },

  async reloadWindow(_: {}): Promise<void> {
    setTimeout(
      () =>
        handleAsyncStd(
          commands.executeCommand('workbench.action.reloadWindow'),
        ),
      1000,
    );
    return Promise.resolve();
  },
};

type Handler = (arg: any) => Promise<any>;

interface AbstractProtocol {
  [name: string]: Handler;
}

function activate(_: ExtensionContext) {
  const loggedProtocol: AbstractProtocol = mapObjectValues(
    protocol as AbstractProtocol,
    (name, handler) => async (arg: any): Promise<any> => {
      log.info(`Received request "${name}" with arguments ${stringify(arg)}`);
      return handler(arg);
    },
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
}

Modules.register(activate);
