// these modify prototypes of bultin classes, must be imported first
import "../library/arrayPrototype";
import "../library/stringPrototype";
import "./utils/locationPrototype";
import "./utils/positionPrototype";
import "./utils/rangePrototype";
import "./utils/selectionPrototype";
import "./utils/uriPrototype";

// must be imported first
import "./modules/logging";

import { env, type ExtensionContext as VscodeExtensionContext } from "vscode";
import { log } from "../library/logging";
import * as nodejs from "../library/nodejs";
import { stringify as str } from "../library/stringify";
import { TreeSitter } from "../library/treeSitter";
import { Modules } from "./modules/module";
import { registerAllCommands } from "./utils/commands";
import { setExtensionContext } from "./utils/extensionContext";

import { pick } from "@sergei-dyshel/typescript/object";
import { ExtensionContext } from "@sergei-dyshel/vscode";
import "./allModules";

export async function activate(context: VscodeExtensionContext) {
  console.log("Extension activating");

  setExtensionContext(context);
  ExtensionContext.set(context);

  await TreeSitter.init(
    nodejs.path.join(context.extensionPath, "tree-sitter"),
    nodejs.path.join(context.extensionPath, "tree-sitter"),
  );

  await Modules.activateAll(context);
  context.subscriptions.push(...registerAllCommands());

  log.info(`Activated ${str(Modules.fileNames())}`);

  log.info("Extension path", context.extensionPath);

  log.info("Global storage path", context.globalStorageUri.fsPath);
  if (context.storageUri)
    log.info("Workspace storage path", context.storageUri.fsPath);

  log.info(
    "Extension environment",
    pick(
      env,
      "appHost",
      "appName",
      "appRoot",
      "machineId",
      "sessionId",
      "remoteName",
      "uiKind",
      "remoteAuthority",
    ),
  );

  // history.activate(context);
}

// this method is called when your extension is deactivated
export async function deactivate() {
  await Modules.deactivateAll();
}
