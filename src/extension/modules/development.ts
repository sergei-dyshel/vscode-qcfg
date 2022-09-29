import type { ExtensionContext } from 'vscode';
import { TabInputText, TabInputTextDiff, window } from 'vscode';
import { log } from '../../library/logging';
import { registerCommandWrapped } from './exception';
import { showLog } from './logging';
import { Modules } from './module';

function dumpContext() {
  const tab = window.tabGroups.activeTabGroup.activeTab;
  if (tab) {
    log.info('Tab label:', tab.label);
    log.info('Tab group view column', tab.group.viewColumn);
    const input = tab.input;
    if (input instanceof TabInputText) {
      log.info('TabInputText', input.uri);
    } else if (input instanceof TabInputTextDiff) {
      log.info('TabInputTextDiff', input.original, input.modified);
    } else {
      log.info('Tab input:', input);
    }
  }

  const editor = window.activeTextEditor;
  if (editor) {
    log.info('Editor view column', editor.viewColumn);
    const document = editor.document;
    log.info('Editor document', document.languageId, document.uri);
    log.info('Editor selection', editor.selection);
  }

  showLog();
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerCommandWrapped('qcfg.dumpContext', dumpContext),
  );
}

Modules.register(activate);
