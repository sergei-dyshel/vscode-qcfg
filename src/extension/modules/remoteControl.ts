import * as shlex from "shlex";
import type { ExtensionContext, WorkspaceFolder } from "vscode";
import { Position, Selection, Uri, window, workspace } from "vscode";
import { assert } from "../../library/exception";
import { fileExists } from "../../library/fileUtils";
import { log } from "../../library/logging";
import * as nodejs from "../../library/nodejs";
import { parseNumber } from "../../library/stringUtils";
import { handleAsyncStd, handleErrors } from "./exception";
import { Modules } from "./module";
import { openRemoteFileViaSsh } from "./sshFs";

// eslint-disable-next-line import/no-mutable-exports
export let port = 48123;

async function handleOpen(folder: string, location: string) {
  assert(nodejs.path.isAbsolute(folder), `"${folder}" is not absolute path`);
  let wsFolder: WorkspaceFolder | undefined;
  let found = false;
  for (wsFolder of workspace.workspaceFolders ?? [])
    if (wsFolder.uri.fsPath === folder) {
      found = true;
      break;
    }
  if (!wsFolder || !found) {
    log.info(`"${folder}" does not correspond to this workspace's folder`);
    return;
  }

  const [file, line = undefined, column = undefined] = location.split(":");
  if (!file) log.fatal("Filename missing");

  let fullPath: string;
  if (nodejs.path.isAbsolute(file)) {
    if (!file.startsWith(folder))
      log.fatal(`File "${file}" does not belong to "${wsFolder.name}"`);
    fullPath = file;
  } else {
    fullPath = nodejs.path.join(wsFolder.uri.fsPath, file);
    const exists = await fileExists(fullPath);
    if (!exists)
      log.fatal(`File "${file}" does not exist in "${wsFolder.name}"`);
  }
  const lineNo = parseNumber(line);
  const colNo = column === "" ? 1 : parseNumber(column, 1);
  if (lineNo === undefined) return;
  const pos = new Position(lineNo - 1, colNo - 1);

  await window.showTextDocument(Uri.file(fullPath), {
    selection: new Selection(pos, pos),
  });
}

function checkFolder(folder: string) {
  assert(nodejs.path.isAbsolute(folder), `"${folder}" is not absolute path`);
  for (const wsFolder of workspace.workspaceFolders ?? [])
    if (wsFolder.uri.fsPath === folder) {
      return true;
    }
  return false;
}

async function handleCmd(cmd: string) {
  const parts = shlex.split(cmd);
  assert(parts.length >= 2, "Invalid command received", cmd);
  const [opcode, folder, ...args] = parts;
  log.debug(`Received command: ${opcode}, folder: ${folder}, args: ${args}`);

  if (!checkFolder(folder)) {
    log.info(`"${folder}" does not correspond to this workspace's folder`);
    return;
  }
  // await focusWindow();

  switch (opcode) {
    case "open":
      assert(args.length === 1);
      await handleOpen(folder, args[0]);
      break;
    case "openSsh":
      await openRemoteFileViaSsh(args[0]);
      break;
    default:
      log.error("Invalid opcode: " + opcode);
  }
}

function activate(_context: ExtensionContext) {
  const server = nodejs.net.createServer((socket) => {
    socket.on("data", () => {
      handleErrors((data) => {
        handleAsyncStd(handleCmd(data.toString() as string));
      });
    });
  });
  server.listen(port, "127.0.0.1");
  server.on("listening", () => {
    log.info(`Listening on port ${port}`);
  });
  server.on("error", (err) => {
    const error = err as NodeJS.ErrnoException;
    if (error.code === "EADDRINUSE") {
      log.debug(`Port ${port} already in use`);
      port += 1;
      server.listen(port, "127.0.0.1");
    } else {
      log.info(`Error listening on port ${port}: ${error.message}`);
    }
  });
}

Modules.register(activate);
