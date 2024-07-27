import type { ExtensionContext } from "vscode";
import { workspace } from "vscode";
import { registerAsyncCommandWrapped } from "./exception";
import { Modules } from "./module";

async function createDb() {
  return workspace.findFiles("**");
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.tagdb.create", createDb),
  );
}

Modules.register(activate);
