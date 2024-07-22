import type { ExtensionContext } from 'vscode';
import { commands, Selection, TextEditorRevealType, window } from 'vscode';
import { registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';

async function focusEditorBeside(syncPosition: boolean) {
  switch (window.tabGroups.all.length) {
    case 0:
      throw new Error('No tab groups opened');
    case 1:
      await splitEditorToDirection('right');
    case 2:
      break;
    default:
      throw new Error('There is more than 2 editor groups');
  }
  if (!syncPosition) {
    await commands.executeCommand('workbench.action.focusNextGroup');
  }
  const tabGroup = (() => {
    for (const group of window.tabGroups.all) {
      if (group !== window.tabGroups.activeTabGroup) return group;
    }
    throw new Error("Shouldn't get here");
  })();
  const editor = getActiveTextEditor();
  await window.showTextDocument(getActiveTextEditor().document, {
    viewColumn: tabGroup.viewColumn,
    selection: editor.selection,
  });
}

type DirectionArg = 'up' | 'down' | 'left' | 'right';

async function splitEditorToDirection(direction: DirectionArg) {
  const splitCmd = {
    down: 'workbench.action.splitEditorDown',
    left: 'workbench.action.splitEditorLeft',
    right: 'workbench.action.splitEditorRight',
    up: 'workbench.action.splitEditorUp',
  };
  await commands.executeCommand(splitCmd[direction]);
}

async function syncEditorToDirection(args: unknown[]) {
  const dir = args[0] as DirectionArg;
  const editor = getActiveTextEditor();
  const visible = editor.visibleRanges[0];
  const pos = editor.selection.active;
  const doc = editor.document;
  const column = editor.viewColumn;
  const focusCmd = {
    up: 'workbench.action.focusAboveGroup',
    down: 'workbench.action.focusBelowGroup',
    left: 'workbench.action.focusLeftGroup',
    right: 'workbench.action.focusRightGroup',
  };
  await commands.executeCommand(focusCmd[dir]);
  const adjEditor = window.activeTextEditor!;
  if (adjEditor.viewColumn === column) {
    await splitEditorToDirection(dir);
    return;
  }
  // console.log(`Active editor ${editor.viewColumn}, new column ${newColumn}`);
  const newEditor = await window.showTextDocument(doc, adjEditor);
  newEditor.selection = new Selection(pos, pos);
  newEditor.revealRange(visible, TextEditorRevealType.InCenter);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.focusEditorBeside', async () =>
      focusEditorBeside(false /* do not sync */),
    ),
    registerAsyncCommandWrapped('qcfg.syncToEditorBeside', async () =>
      focusEditorBeside(true /* sync */),
    ),
    registerAsyncCommandWrapped(
      'qcfg.syncEditorToDirection',
      syncEditorToDirection,
    ),
  );
}

Modules.register(activate);
