import type { ExtensionContext, TextEditor } from "vscode";
import { commands, env, Range, ThemeColor, workspace } from "vscode";
import { check } from "../../library/exception";
import { lazyValue } from "../../library/tsUtils";
import { RangeDecorator } from "../utils/decoration";
import { expandSelectionLinewise, replaceText } from "./editing";
import { listenWrapped, registerAsyncCommandWrapped } from "./exception";
import { Modules } from "./module";
import { swapRanges, trimWhitespace } from "./textUtils";
import { getActiveTextEditor } from "./utils";

let mark:
  | undefined
  | {
      editor: TextEditor;
      range: Range;
      text: string;
    };

const decorator = lazyValue(
  () =>
    new RangeDecorator(
      {
        borderWidth: "0px 0px 0px 4px",
      },
      {
        borderWidth: "0px 4px 0px 0px",
      },
      {
        borderStyle: "solid",
        borderColor: new ThemeColor("editor.selectionBackground"),
      },
    ),
);

async function normalCopy() {
  return commands.executeCommand("editor.action.clipboardCopyAction");
}

async function markAndCopy(editor: TextEditor, range: Range) {
  if (mark) decorator().clear(mark.editor);
  decorator().decorate(editor, [range]);
  mark = {
    editor,
    range,
    text: editor.document.getText(range),
  };
  return normalCopy();
}

async function markAndCopySelection() {
  const editor = getActiveTextEditor();
  return markAndCopy(editor, editor.selection);
}

async function isMarked(editor: TextEditor, range: Range) {
  if (!mark) return false;

  const rangeIsMarked =
    mark.editor === editor &&
    mark.range.isEqual(range) &&
    mark.text === editor.document.getText(range);

  if (!rangeIsMarked) return false;

  if (mark.text !== (await env.clipboard.readText())) {
    invalidateMark();
    return false;
  }
  return true;
}

async function isMarkValid() {
  const result =
    mark !== undefined && (await isMarked(mark.editor, mark.range));
  return result;
}

async function smartCopy() {
  const editor = getActiveTextEditor();
  const document = editor.document;

  if (editor.selections.length > 1) return normalCopy();

  const selection = editor.selection;
  if (selection.isEmpty) {
    if (document.lineAt(selection.active.line).isEmptyOrWhitespace) {
      return;
    }
    if (await isMarked(editor, selection.expandLinewise())) {
      await commands.executeCommand("editor.action.smartSelect.expand");
      return markAndCopySelection();
    }
    return markAndCopy(editor, selection.expandLinewise());
  }

  if (!(await isMarked(editor, selection))) {
    return markAndCopySelection();
  }

  if (selection.isLinewise) {
    editor.selection = trimWhitespace(document, selection).asSelection(
      selection.isReversed,
    );
    return markAndCopySelection();
  }

  if (selection.isSingleLine) {
    await commands.executeCommand("editor.action.smartSelect.expand");
    return markAndCopySelection();
  }
  editor.selection = selection
    .expandLinewise()
    .asSelection(selection.isReversed);
  return markAndCopySelection();
}

async function normalPaste() {
  await commands.executeCommand("editor.action.clipboardPasteAction");
}

async function pasteAndMark(editor: TextEditor, text: string) {
  await replaceText(editor, editor.selection, text, { select: true });
  const range = editor.selection;
  await markAndCopy(editor, range);
  editor.selection = range.end.asRange.asSelection();
}

async function smartPaste() {
  const editor = getActiveTextEditor();
  if (editor.selections.length > 1) {
    return normalPaste();
  }
  const text = await env.clipboard.readText();
  if (!text.endsWith("\n")) {
    return pasteAndMark(editor, text);
  }

  // selection is linewise
  const selection = editor.selection;
  if (selection.isEmpty) {
    editor.selection = Range.fromPosition(
      selection.active.withCharacter(0),
    ).asSelection();
  } else if (!selection.isLinewise) {
    expandSelectionLinewise();
  }
  return pasteAndMark(editor, text);
}

async function swapWithMark() {
  const editor = getActiveTextEditor();
  check(mark !== undefined && (await isMarkValid()), "No text marked");
  check(editor.selections.length === 1, "Multiple ranges selected");

  if (mark.editor.document === editor.document) {
    await swapRanges(
      editor,
      mark.range,
      editor.selection,
      2 /* select second range */,
    );
    return markAndCopySelection();
  }
  return undefined;
}

function invalidateMark() {
  if (mark) decorator().clear(mark.editor);
  mark = undefined;
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.smartCopy", smartCopy),
    registerAsyncCommandWrapped("qcfg.smartPaste", smartPaste),
    registerAsyncCommandWrapped("qcfg.swapWithMark", swapWithMark),
    listenWrapped(workspace.onDidChangeTextDocument, invalidateMark),
  );
}

Modules.register(activate);
