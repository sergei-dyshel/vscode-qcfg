import type { ExtensionContext } from "vscode";
import { commands } from "vscode";
import { registerAsyncCommandWrapped } from "./exception";
import { Modules } from "./module";
import { trimBrackets, trimWhitespace } from "./textUtils";
import { getActiveTextEditor } from "./utils";

async function smartSelectExpand() {
  return commands.executeCommand("editor.action.smartSelect.expand");
}

async function smartSelectShrink() {
  return commands.executeCommand("editor.action.smartSelect.shrink");
}

async function expandFaster() {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const selection = editor.selection;
  await smartSelectExpand();
  const selection1 = editor.selection;
  if (selection1.isEqual(selection)) return;
  await smartSelectExpand();
  const selection2 = editor.selection;
  if (
    selection2.isEqual(selection1) ||
    trimBrackets(document, selection2).isEqual(selection1) ||
    trimWhitespace(document, selection1).isEqual(selection)
  ) {
    return;
  }
  await smartSelectShrink();
}

async function shrinkFaster() {
  const editor = getActiveTextEditor();
  const { document, selection } = editor;
  await smartSelectShrink();
  const selection1 = selection;
  if (
    selection1.isEqual(selection) ||
    trimBrackets(document, selection).isEqual(selection1)
  )
    await smartSelectShrink();
}

function activate(extContext: ExtensionContext) {
  extContext.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.expandSelectionFaster", expandFaster),
    registerAsyncCommandWrapped("qcfg.shrinkSelectionFaster", shrinkFaster),
  );
}

Modules.register(activate);
