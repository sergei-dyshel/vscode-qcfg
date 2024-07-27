// noinspection JSUnusedAssignment

import type {
  CompletionList,
  ExtensionContext,
  TextDocument,
  TextEditor,
  TextEditorEdit,
} from "vscode";
import {
  commands,
  ConfigurationTarget,
  Position,
  Range,
  Selection,
  TextEditorRevealType,
  Uri,
  window,
  workspace,
} from "vscode";
import { fileExists } from "../../library/fileUtils";
import { NumberIterator } from "../../library/tsUtils";
import { UserCommands } from "../../library/userCommands";
import { lineIndentation } from "./documentUtils";
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
  registerTextEditorCommandWrapped,
} from "./exception";
import { expandHome } from "./fileUtils";
import { Modules } from "./module";
import {
  offsetPosition,
  selectRange,
  trimBrackets,
  trimWhitespace,
} from "./textUtils";
import { getActiveTextEditor, getCursorWordContext } from "./utils";

export function expandSelectionLinewise() {
  const editor = getActiveTextEditor();
  if (editor.selections.length > 1) return;

  const selection = editor.selection;
  const document = editor.document;

  if (editor.selections.length > 1) return;
  if (selection.isLinewise)
    selectRange(editor, trimWhitespace(document, selection));
  else selectRange(editor, selection.expandLinewise());
}

async function surroundWith(args: unknown[]) {
  const editor = getActiveTextEditor();
  const selection = editor.selection;
  if (selection.isEmpty) return;
  const [prefix, suffix, direction] = args as string[];
  const text = editor.document.getText(selection);
  const newText = prefix + text + suffix;
  const selectionStart = selection.start;
  const editsDone = await editor.edit((edit: TextEditorEdit) => {
    edit.replace(selection, newText);
  });
  if (!editsDone) throw new Error("[surroundWith] Could not apply edit");
  let pos: Position;
  if (direction === "left") pos = selectionStart;
  else if (direction === "right")
    pos = offsetPosition(editor.document, selectionStart, newText.length);
  else throw new Error(`surroundWith: Invalid direction "${direction}"`);
  editor.selection = new Selection(pos, pos);
  console.log("Selection:", editor.selection);
}

/**
 * Cause file to appear as dirty without changing it
 */
export async function touchDocument(editor: TextEditor) {
  await editor.edit(
    (builder) => {
      builder.insert(editor.document.positionAt(0), " ");
    },
    { undoStopBefore: false, undoStopAfter: false },
  );
  await editor.edit(
    (builder) => {
      builder.delete(
        new Range(editor.document.positionAt(0), editor.document.positionAt(1)),
      );
    },
    { undoStopBefore: false, undoStopAfter: false },
  );
}

function swapCursorAndAnchor(editor: TextEditor) {
  editor.selections = editor.selections.map((sel) => sel.reverse());
}

async function navigateBackToPreviousFile() {
  const firstEditor = window.activeTextEditor;
  if (!firstEditor) return;
  let editor = firstEditor;
  let selection: Selection | undefined;
  while (
    editor.document === firstEditor.document &&
    editor.selection !== selection
  ) {
    selection = editor.selection;
    await commands.executeCommand("workbench.action.navigateBack");
    if (!window.activeTextEditor) return;
    editor = window.activeTextEditor;
  }
}

async function goToDefinition() {
  await commands.executeCommand("editor.action.goToDeclaration");
}

async function peekReferences() {
  await commands.executeCommand("editor.action.referenceSearch.trigger");
}

function gotoLineRelative(delta: number) {
  const editor = getActiveTextEditor();
  const active = editor.selection.active;
  const pos = new Position(active.line + delta, active.character);
  editor.selection = new Selection(pos, pos);
}

async function wrapWithBracketsInline(args: string[]) {
  const editor = getActiveTextEditor();
  const selection = editor.selection;
  const document = editor.document;
  const prevLine = selection.start.line - 1;
  const nextLine = selection.end.line + 1;
  if (prevLine < 0 || nextLine > document.lineCount - 1)
    throw new Error("Can not wrap first or last line");
  await editor.edit((builder) => {
    const start = document.lineAt(prevLine).range.end;
    const indentation = lineIndentation(document, prevLine);
    builder.insert(start, " " + args[0]);
    const end = new Position(nextLine, 0);
    builder.insert(end, indentation + args[1] + "\n");
  });
}

/**
 * Replace range with text and return replaced range
 */
export async function replaceText(
  editor: TextEditor,
  range: Range,
  text: string,
  options?: { select?: boolean; reveal?: boolean },
): Promise<Range> {
  await editor.edit((builder) => {
    builder.replace(range, text);
  });
  const newRange = new Range(
    range.start,
    offsetPosition(editor.document, range.start, text.length),
  );
  if (options) {
    if (options.select) editor.selection = newRange.asSelection();
    if (options.reveal) editor.revealRange(range);
  }
  return newRange;
}

async function stripBrackets() {
  const editor = getActiveTextEditor();
  const selection = editor.selection;
  const strippedRange = trimBrackets(editor.document, selection);
  if (strippedRange.isEqual(selection)) return;
  const strippedText = editor.document.getText(strippedRange);
  const start = selection.start;
  const reversed = selection.isReversed;
  await editor.edit((builder) => {
    builder.replace(selection, strippedText);
  });
  const end = offsetPosition(editor.document, start, strippedText.length);
  editor.selection = reversed
    ? new Selection(end, start)
    : new Selection(start, end);
}

function selectWordUnderCursor() {
  const word = getCursorWordContext();
  if (!word) throw new Error("No word under cursor");
  word.editor.selection = word.range.asSelection();
}

type LineNumberConf = "on" | "off" | "interval" | "relative";

async function toggleRelativeNumbers() {
  const SECTION = "editor.lineNumbers";
  const conf = workspace.getConfiguration();
  const info = conf.inspect<string>(SECTION)!;
  if (info.workspaceFolderValue || info.workspaceValue)
    throw new Error(`"${SECTION}" is overriden on workspace/folder level`);
  const value = (info.globalValue ?? info.defaultValue) as LineNumberConf;
  switch (value) {
    case "on":
      await conf.update(SECTION, "relative", ConfigurationTarget.Global);
      break;
    case "relative":
      await conf.update(SECTION, "on", ConfigurationTarget.Global);
      break;
    default:
      throw new Error(`"${SECTION} has value of '${value}`);
  }
}

function getBlockStart(
  document: TextDocument,
  line: number,
  up: boolean,
): number {
  const iter = up
    ? new NumberIterator(line - 1, 0, -1)
    : new NumberIterator(line + 1, document.lineCount, 1);
  const isBlank = (i: number) => document.lineAt(i).isEmptyOrWhitespace;
  for (const i of iter) {
    if (up && i + 1 < line && isBlank(i) && !isBlank(i + 1)) return i + 1;
    if (!up && isBlank(i - 1) && !isBlank(i)) return i;
  }
  // no block start found
  return up ? 0 : document.lineCount - 1;
}

function goToBlockStart(up: boolean, select: boolean) {
  const editor = getActiveTextEditor();
  const document = editor.document;
  const active = editor.selection.active;
  const blockStart = getBlockStart(document, active.line, up);
  if (select) {
    const newAnchor = editor.selection.anchor.with(undefined, 0);
    const newActive = new Position(blockStart, 0);
    editor.selection = new Selection(newAnchor, newActive);
  } else {
    const newActive = new Position(
      blockStart,
      document.lineAt(blockStart).firstNonWhitespaceCharacterIndex,
    );
    editor.selection = new Selection(newActive, newActive);
  }
  editor.revealRange(
    new Range(editor.selection.active, editor.selection.active),
  );
}

async function insertPathFromDialog() {
  const editor = getActiveTextEditor();
  let preSelected: Uri | undefined;
  if (!editor.selection.isEmpty) {
    const path = expandHome(editor.document.getText(editor.selection));
    if (await fileExists(path)) preSelected = Uri.file(path);
  }
  const uris = await window.showOpenDialog({
    canSelectFolders: true,
    canSelectMany: true,
    defaultUri: preSelected,
  });
  if (!uris || uris.isEmpty) return;
  const result =
    uris.length === 1
      ? uris[0].fsPath
      : uris.map((uri) => uri.fsPath).join(" ");
  await replaceText(editor, editor.selection, result);
}

async function executeCompletionItemProvider() {
  const editor = getActiveTextEditor();
  const complList: CompletionList | undefined = await commands.executeCommand(
    "vscode.executeCompletionItemProvider",
    editor.document.uri,
    editor.selection.active,
  );
  console.info(complList);
}

UserCommands.register(
  {
    command: "qcfg.editor.revealAtTop",
    title: "Reveal selection at top",
    callback: () => {
      const editor = getActiveTextEditor();
      editor.revealRange(editor.selection, TextEditorRevealType.AtTop);
    },
  },
  {
    command: "qcfg.editor.revealInCenter",
    title: "Reveal selection in center",
    callback: () => {
      const editor = getActiveTextEditor();
      editor.revealRange(editor.selection, TextEditorRevealType.InCenter);
    },
  },
);

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerSyncCommandWrapped("qcfg.gotoLineRelative", gotoLineRelative),
    registerAsyncCommandWrapped("qcfg.insertPath", insertPathFromDialog),
    registerSyncCommandWrapped("qcfg.block.goUp", () => {
      goToBlockStart(true /* up */, false /* jump */);
    }),
    registerSyncCommandWrapped("qcfg.block.goDown", () => {
      goToBlockStart(false /* down */, false /* jump */);
    }),
    registerSyncCommandWrapped("qcfg.block.selectUp", () => {
      goToBlockStart(true /* up */, true /* select */);
    }),
    registerSyncCommandWrapped("qcfg.block.selectDown", () => {
      goToBlockStart(false /* up */, true /* select */);
    }),
    registerSyncCommandWrapped("qcfg.selectLines", expandSelectionLinewise),
    registerAsyncCommandWrapped("qcfg.goToDefinition", goToDefinition),
    registerAsyncCommandWrapped("qcfg.peekReferences", peekReferences),
    registerTextEditorCommandWrapped(
      "qcfg.swapCursorAndAnchor",
      swapCursorAndAnchor,
    ),
    registerAsyncCommandWrapped("qcfg.surroundWith", surroundWith),
    registerAsyncCommandWrapped(
      "qcfg.wrapWithBracketsInline",
      wrapWithBracketsInline,
    ),
    registerAsyncCommandWrapped("qcfg.stripBrackets", stripBrackets),
    registerAsyncCommandWrapped(
      "qcfg.navigateBackToPreviousFile",
      navigateBackToPreviousFile,
    ),
    registerSyncCommandWrapped(
      "qcfg.selectWordUnderCursor",
      selectWordUnderCursor,
    ),
    registerAsyncCommandWrapped(
      "qcfg.toggleRelativeLineNumbers",
      toggleRelativeNumbers,
    ),
    registerAsyncCommandWrapped(
      "qcfg.resolveCompletions",
      executeCompletionItemProvider,
    ),
  );
}

Modules.register(activate);
