import type { ExtensionContext, TextEditor } from 'vscode';
import { commands, ViewColumn, window } from 'vscode';
import { listenAsyncWrapped } from './exception';
import { Modules } from './module';
import { getVisibleEditor } from './windowUtils';

async function onEditorChanged(editor: TextEditor | undefined) {
  if (!editor) return;
  if (editor.document.languageId !== 'markdown') return;

  // only act if changed editor in first column
  if (editor.viewColumn !== ViewColumn.One) return;

  // either second column not present or there is already some webview there
  if (!getVisibleEditor(ViewColumn.Two)) return;

  await commands.executeCommand('markdown.showPreviewToSide');
  editor.show(editor.viewColumn);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenAsyncWrapped(window.onDidChangeActiveTextEditor, onEditorChanged),
  );
}

Modules.register(activate);
