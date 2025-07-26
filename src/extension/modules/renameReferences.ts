import { getActiveTextEditor } from "@sergei-dyshel/vscode";
import type { ExtensionContext } from "vscode";
import { window, workspace, WorkspaceEdit } from "vscode";
import { assert, assertNotNull, check } from "../../library/exception";
import { log } from "../../library/logging";
import { mapNonNull } from "../../library/tsUtils";
import { registerAsyncCommandWrapped } from "./exception";
import { Modules } from "./module";
import { dedupeLocations, resolveLocations } from "./savedSearch";
import { executeReferenceProvider } from "./search";
import { revealSelection } from "./textUtils";

async function renameReferences(needsConfirmation: boolean) {
  const editor = getActiveTextEditor();
  const position = editor.selection.active;
  const document = editor.document;
  const wordRange = document.getWordRangeAtPosition(position);
  assertNotNull(wordRange, "Cursor is not on word");

  const name = document.getText(wordRange);
  const locations = await executeReferenceProvider(document.uri, position);
  assert(!locations.isEmpty, `No references found for "${name}""`);

  const newName = await window.showInputBox({
    title: "Rename references",
    value: name,
    placeHolder: `Enter new name for "${name}"`,
  });
  if (!newName) return;

  await resolveLocations(locations);
  const dedupedLocations = dedupeLocations(locations);
  const edit = new WorkspaceEdit();
  for (const location of dedupedLocations) {
    let word: string;
    try {
      const doc = await workspace.openTextDocument(location.uri);
      word = doc.getText(location.range);
    } catch (err) {
      log.error(`Failed to open document ${location.uri}: ${err}`);
      continue;
    }
    let invalid = false;
    if (word !== name) invalid = true;
    const label = invalid
      ? "Invalid range"
      : workspace.getWorkspaceFolder(location.uri)?.name ?? "Not in workspace";
    const metadata =
      needsConfirmation || invalid ? { label, needsConfirmation } : undefined;
    edit.replace(location.uri, location.range, newName, metadata);
  }
  assert(await workspace.applyEdit(edit), "Rename failed");
}

async function selectReferences() {
  const editor = getActiveTextEditor();
  const uri = editor.document.uri;
  const locations = await executeReferenceProvider(
    uri,
    editor.selection.active,
  );
  const ranges = mapNonNull(locations, (loc) =>
    loc.uri.equals(uri) ? loc.range : undefined,
  );
  assert(ranges.length > 0, "No references found");
  check(ranges.length > 1, "Only one occurence");
  editor.selections = ranges.map((range) => range.asSelection());
  revealSelection(editor);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.renameReferences", async () =>
      renameReferences(false /* needsConfirmation */),
    ),
    registerAsyncCommandWrapped(
      "qcfg.renameReferences.withConfirmation",
      async () => renameReferences(true /* needsConfirmation */),
    ),
    registerAsyncCommandWrapped("qcfg.selectReferences", selectReferences),
  );
}

Modules.register(activate);
