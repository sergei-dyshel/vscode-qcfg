import type { ExtensionContext, SourceControlResourceState, Uri } from 'vscode';
import { commands, window } from 'vscode';
import { log } from '../../library/logging';
import { registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';

// inspired by https://github.com/lacroixdavid1/vscode-format-context-menu

async function execCommandOnDocuments(command: string, uris: Uri[]) {
  for (const uri of uris) {
    try {
      await window.showTextDocument(uri);
    } catch (err: unknown) {
      log.error(`Could not open "${uri}": ${err}`);
      continue;
    }
    try {
      await commands.executeCommand(command);
    } catch (err: unknown) {
      log.error(`Could not format "${uri}": ${err}`);
    }
  }
}

function execCommandOnSelectedInExplorer(command: string) {
  return async (clickedFile: Uri, selectedFiles: Uri[]) =>
    execCommandOnDocuments(
      command,
      selectedFiles.isEmpty ? [clickedFile] : selectedFiles,
    );
}

async function formatFilesInScm(
  ...selectedFiles: SourceControlResourceState[]
) {
  return execCommandOnDocuments(
    'editor.action.formatDocument',
    selectedFiles.map((x) => x.resourceUri),
  );
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped(
      'qcfg.explorer.format',
      execCommandOnSelectedInExplorer('editor.action.formatDocument'),
    ),
    registerAsyncCommandWrapped(
      'qcfg.explorer.organizeImports',
      execCommandOnSelectedInExplorer('editor.action.organizeImports'),
    ),
    registerAsyncCommandWrapped('qcfg.scm.format', formatFilesInScm),
  );
}

Modules.register(activate);
