import * as luxon from 'luxon';
import type { ExtensionContext, TextEditor } from 'vscode';
import { commands, Uri, ViewColumn, window, workspace } from 'vscode';
import { assertNotNull } from '../../library/exception';
import * as nodejs from '../../library/nodejs';
import { getWorkspaceRoot } from '../utils/workspace';
import { listenAsyncWrapped, registerAsyncCommandWrapped } from './exception';
import { getWorkspaceFolderByName } from './fileUtils';
import { Modules } from './module';
import { getVisibleEditor } from './windowUtils';

async function onEditorChanged(editor: TextEditor | undefined) {
  if (!editor) return;

  if (
    !workspace
      .getConfiguration(undefined, editor.document)
      .get<boolean>('qcfg.autoMarkdownPreview', false)
  )
    return;

  if (editor.document.languageId !== 'markdown') return;

  // only act if changed editor in first column
  if (editor.viewColumn !== ViewColumn.One) return;

  // either second column not present or there is already some webview there
  if (!getVisibleEditor(ViewColumn.Two)) return;

  await commands.executeCommand('markdown.showPreviewToSide');
  await window.showTextDocument(editor.document, editor.viewColumn);
}

async function newNote() {
  const config = workspace.getConfiguration();

  let rootPath = getWorkspaceRoot();
  assertNotNull(rootPath, 'No workspace folder is opened');
  if ((workspace.workspaceFolders?.length ?? 1) > 1) {
    // multiple workspace folders
    const folderName = config.get<string>('qcfg.newNote.folder');
    assertNotNull(
      folderName,
      `"qcfg.newNote.folder" not defined for multi-folder workspace`,
    );
    const folder = getWorkspaceFolderByName(folderName);
    assertNotNull(folder, `There is no workspace folder "${folderName}"`);
    rootPath = folder.uri.fsPath;
  }

  const path = config.get<string>('qcfg.newNote.path');
  assertNotNull(path, `"qcfg.newNote.path" not defined`);
  const fileName = luxon.DateTime.now().toFormat('yyyy-MM-dd HH-mm');
  const newFile = Uri.parse(
    'untitled:' + nodejs.path.join(rootPath, path, fileName + '.md'),
  );
  const document = await workspace.openTextDocument(newFile);
  await window.showTextDocument(document);
  await commands.executeCommand('workbench.action.files.save');
  await commands.executeCommand('fileutils.renameFile');
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenAsyncWrapped(window.onDidChangeActiveTextEditor, onEditorChanged),
    registerAsyncCommandWrapped('qcfg.newNote', newNote),
  );
}

Modules.register(activate);
