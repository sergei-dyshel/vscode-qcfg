import type { ExtensionContext } from "vscode";
import { CheckError } from "../../library/exception";
import { registerSyncCommandWrapped } from "./exception";
import { Modules } from "./module";

function emptyCommand() {
  throw new CheckError("This keybinding does nothing");
}

function activate(extContext: ExtensionContext) {
  extContext.subscriptions.push(
    registerSyncCommandWrapped("qcfg.emptyCommand", emptyCommand),
  );
}
Modules.register(activate);
