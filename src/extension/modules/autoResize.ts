import type { ExtensionContext, TextEditor, ViewColumn } from 'vscode';
import { commands, window } from 'vscode';
import { log } from '../../library/logging';
import { watchConfiguration } from './configWatcher';
import { listenAsyncWrapped, registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';

let featureEnabled: boolean | undefined;
let resizeSteps: number;
let prevActiveViewColumn: ViewColumn | undefined;

async function evenEditorWidths() {
  return commands.executeCommand('workbench.action.evenEditorWidths');
}

async function updateEnabled(enabled?: boolean) {
  if (featureEnabled === !!enabled) return;
  featureEnabled = !!enabled;
  log.info('Auto-resize', featureEnabled ? 'enabled' : 'disabled');
  await (featureEnabled
    ? onDidChangeActiveTextEditor(window.activeTextEditor)
    : evenEditorWidths());
}

async function onDidChangeActiveTextEditor(editor?: TextEditor) {
  // need to check previous active editor because of the flow:
  // - view column X active
  // - click on another file/symbol in explorer
  // - view column X (last one used) is activated again
  // - we don't want to resize in this case
  if (
    featureEnabled &&
    editor?.viewColumn &&
    window.tabGroups.all.length === 2 &&
    editor.viewColumn !== prevActiveViewColumn
  ) {
    prevActiveViewColumn = editor.viewColumn;
    await evenEditorWidths();
    for (let i = 0; i < resizeSteps; i++)
      await commands.executeCommand('workbench.action.increaseViewWidth');
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenAsyncWrapped(
      window.onDidChangeActiveTextEditor,
      onDidChangeActiveTextEditor,
    ),
    watchConfiguration('qcfg.autoResize.enabled', updateEnabled),
    watchConfiguration('qcfg.autoResize.steps', (steps) => {
      resizeSteps = steps!;
    }),
    registerAsyncCommandWrapped('qcfg.autoResize.toggle', async () =>
      updateEnabled(!featureEnabled),
    ),
  );
}

Modules.register(activate);
