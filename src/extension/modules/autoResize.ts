import type { ExtensionContext, TextEditor, ViewColumn } from 'vscode';
import { commands, window } from 'vscode';
import { log } from '../../library/logging';
import { ConfigurationWatcher } from './configWatcher';
import { listenAsyncWrapped, registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';

const configWatcher = new ConfigurationWatcher(
  ['qcfg.autoResize.steps', 'qcfg.autoResize.enabled'] as const,
  async () => updateEnabled(),
);

let featureEnabled: boolean | undefined;
let prevActiveViewColumn: ViewColumn | undefined;

async function evenEditorWidths() {
  return commands.executeCommand('workbench.action.evenEditorWidths');
}

async function updateEnabled(enabled?: boolean) {
  if (enabled === undefined)
    enabled = configWatcher.getConfiguration().get('qcfg.autoResize.enabled');
  if (featureEnabled !== !!enabled) {
    featureEnabled = !!enabled;
    log.info('Auto-resize', featureEnabled ? 'enabled' : 'disabled');
  }
  await (featureEnabled ? doAutoResize() : evenEditorWidths());
}

async function doAutoResize() {
  if (featureEnabled && window.tabGroups.all.length === 2) {
    await evenEditorWidths();
    for (
      let i = 0;
      i < configWatcher.getConfiguration().getNotNull('qcfg.autoResize.steps');
      i++
    )
      await commands.executeCommand('workbench.action.increaseViewWidth');
  }
}

async function onDidChangeActiveTextEditor(editor?: TextEditor) {
  // need to check previous active editor because of the flow:
  // - view column X active
  // - click on another file/symbol in explorer
  // - view column X (last one used) is activated again
  // - we don't want to resize in this case
  if (editor?.viewColumn) {
    const oldPrev = prevActiveViewColumn;
    prevActiveViewColumn = editor.viewColumn;
    if (editor.viewColumn !== oldPrev) return doAutoResize();
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenAsyncWrapped(
      window.onDidChangeActiveTextEditor,
      onDidChangeActiveTextEditor,
    ),
    configWatcher.register(),
    registerAsyncCommandWrapped('qcfg.autoResize.toggle', async () =>
      updateEnabled(!featureEnabled),
    ),
  );
}

Modules.register(activate);
