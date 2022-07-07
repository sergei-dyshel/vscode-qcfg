import type { ExtensionContext } from 'vscode';
import { window, workspace } from 'vscode';
import { enumUtil } from '../../library/enum';
import { getMemento, PersistentScope } from '../utils/persistentState';
import { StringQuickPick } from '../utils/quickPick';
import { documentRange } from './documentUtils';
import { registerCommandWrapped } from './exception';
import { Modules } from './module';

async function browsePersistentState(scope: PersistentScope) {
  const enumWrapper = enumUtil(PersistentScope);
  const memento = getMemento(scope);

  const qp = new StringQuickPick(memento.keys());
  const scopeName = enumWrapper.getKeyOrThrow(scope);
  qp.options.title = `Browsing ${scopeName} persistent storage, press ENTER to show JSON, ESC to exit`;
  qp.options.ignoreFocusOut = true;
  await qp.showOnly(async (key: string) => {
    const activeEditor = window.activeTextEditor;
    const document =
      activeEditor?.document.isUntitled &&
      activeEditor.document.languageId === 'json'
        ? activeEditor.document
        : await workspace.openTextDocument({ language: 'json' });
    const data = JSON.stringify(memento.get(key), undefined, 4);
    const editor = await window.showTextDocument(document, {
      preserveFocus: true,
    });
    await editor.edit((edit) => {
      edit.replace(documentRange(document), data);
    });
    editor.selection = document.positionAt(0).asRange.asSelection();
  });
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerCommandWrapped('qcfg.persistentStorage.browseGlobal', async () =>
      browsePersistentState(PersistentScope.GLOBAL),
    ),
    registerCommandWrapped('qcfg.persistentStorage.browseWorkspace', async () =>
      browsePersistentState(PersistentScope.WORKSPACE),
    ),
  );
}

Modules.register(activate);
