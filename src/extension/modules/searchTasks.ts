import type { ExtensionContext } from "vscode";
import { Config } from "../../library/config";
import { CheckError } from "../../library/exception";
import { registerAsyncCommandWrapped } from "./exception";
import { Modules } from "./module";
import { runTask } from "./tasks";
import { getActiveTextEditor, getCursorWordContext } from "./utils";

async function searchWordUnderCursor(allFolders: boolean) {
  if (!getCursorWordContext()) {
    throw new CheckError("The cursor is not on word");
  }
  return runTask(
    "search_word",
    {
      type: Config.Tasks.TaskType.SEARCH,
      // eslint-disable-next-line no-template-curly-in-string
      searchTitle: 'Word "${cursorWord}"',
      // eslint-disable-next-line no-template-curly-in-string
      query: "${cursorWord}",
      flags: [Config.Tasks.Flag.CASE, Config.Tasks.Flag.WORD],
    },
    { folder: allFolders ? "all" : undefined },
  );
}

async function searchSelectedText(allFolders: boolean) {
  if (getActiveTextEditor().selection.isEmpty) {
    throw new CheckError("No text selected");
  }
  return runTask(
    "search_selection",
    {
      type: Config.Tasks.TaskType.SEARCH,
      // eslint-disable-next-line no-template-curly-in-string
      searchTitle: 'Selected text "${selectedText}"',
      // eslint-disable-next-line no-template-curly-in-string
      query: "${selectedText}",
      flags: [Config.Tasks.Flag.CASE],
    },
    { folder: allFolders ? "all" : undefined },
  );
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.search.word", async () =>
      searchWordUnderCursor(false),
    ),
    registerAsyncCommandWrapped("qcfg.search.word.allFolders", async () =>
      searchWordUnderCursor(true),
    ),
    registerAsyncCommandWrapped("qcfg.search.selectedText", async () =>
      searchSelectedText(false),
    ),
    registerAsyncCommandWrapped(
      "qcfg.search.selectedText.allFolders",
      async () => searchSelectedText(true),
    ),
  );
}

Modules.register(activate);
