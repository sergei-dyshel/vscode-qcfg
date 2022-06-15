import type {
  ConfigurationChangeEvent,
  ExtensionContext,
  TextEditor,
  ViewColumn,
} from 'vscode';
import { commands, window, workspace } from 'vscode';
import { log } from '../../library/logging';
import {
  handleAsyncStd,
  listenAsyncWrapped,
  registerAsyncCommandWrapped,
} from './exception';
import { Modules } from './module';

let featureEnabled: boolean;
let prevActiveViewColumn: ViewColumn | undefined;

async function evenEditorWidths() {
  return commands.executeCommand('workbench.action.evenEditorWidths');
}

async function updateEnabled(toggle = false) {
  featureEnabled = toggle
    ? !featureEnabled
    : workspace
        .getConfiguration()
        .get<boolean>('qcfg.autoResize.enabled', true);
  log.info('Auto-resize', featureEnabled ? 'enabled' : 'disabled');
  if (featureEnabled)
    await onDidChangeActiveTextEditor(window.activeTextEditor);
  else await evenEditorWidths();
}

async function onDidChangeConfiguration(event: ConfigurationChangeEvent) {
  if (event.affectsConfiguration('qcfg.autoResize')) await updateEnabled();
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
    const steps = workspace
      .getConfiguration()
      .get<number>('qcfg.autoResize.steps', 1);
    for (let i = 0; i < steps; i++)
      await commands.executeCommand('workbench.action.increaseViewWidth');
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenAsyncWrapped(
      window.onDidChangeActiveTextEditor,
      onDidChangeActiveTextEditor,
    ),
    listenAsyncWrapped(
      workspace.onDidChangeConfiguration,
      onDidChangeConfiguration,
    ),
    registerAsyncCommandWrapped('qcfg.autoResize.toggle', async () =>
      updateEnabled(true /* toggle */),
    ),
  );
  handleAsyncStd(updateEnabled());
}

Modules.register(activate);
