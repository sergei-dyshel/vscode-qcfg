import { Modules } from './module';
import { ExtensionContext, commands, env } from 'vscode';
import { registerAsyncCommandWrapped } from './exception';
import { getActiveTextEditor } from './utils';
import { trimWhitespace } from './textUtils';

async function normalCopy() {
  return commands.executeCommand('editor.action.clipboardCopyAction');
}

async function smartCopy() {
  const editor = getActiveTextEditor();
  const document = editor.document;

  if (editor.selections.length > 1) return normalCopy();

  const selection = editor.selection;
  if (selection.isEmpty) {
    if (document.lineAt(selection.active.line).isEmptyOrWhitespace) return;
    return normalCopy();
  }

  // trying to copy already copied text
  if (document.getText(selection) === (await env.clipboard.readText())) {
    if (selection.isLinewise) {
      editor.selection = trimWhitespace(document, selection).asSelection(
        selection.isReversed,
      );
      return normalCopy();
    }
    if (
      trimWhitespace(document, selection.expandLinewise()).isEqual(selection)
    ) {
      editor.selection = selection
        .expandLinewise()
        .asSelection(selection.isReversed);
      return normalCopy();
    }
    return;
  }
  return normalCopy();
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.smartCopy', smartCopy),
  );
}

Modules.register(activate);
