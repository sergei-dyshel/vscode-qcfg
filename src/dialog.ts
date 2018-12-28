'use strict';

import * as vscode from 'vscode';
import {window, workspace, commands} from 'vscode';

import {Logger, str} from './logging';
const log = new Logger('dialog');

// export function selectFromList<T extends vscode.QuickPickItem>(
//     items: T[], options?: vscode.QuickPickOptions): Thenable<T|undefined> {

let extContext: vscode.ExtensionContext;

export async function inputWithHistory(persistentKey: string):
    Promise<string|undefined> {
  const items: string[] = extContext.globalState.get(persistentKey, []);
  const selected = await selectFromList(items);
  if (!selected)
    return;
  const newItems = items.filter((x, i, a) => x !== selected);
  newItems.unshift(selected);
  extContext.globalState.update(persistentKey, newItems);
  return selected;
}

export function selectFromList(items: string[]): Thenable<string|undefined> {
  return new Promise((resolve, reject) => {
    const qp = window.createQuickPick();
    const qpItems: vscode.QuickPickItem[] = items.map((x) => ({label: x}));
    qp.items = qpItems;
    const onDidHideDisposer = qp.onDidHide(() => {
      resolve(undefined);
      qp.dispose();
    });
    qp.onDidAccept(() => {
      resolve(qp.selectedItems[0].label);
      onDidHideDisposer.dispose();
      qp.hide();
      qp.dispose();
    });
    qp.onDidChangeValue(() => {
      const exactLabel = qp.items.find((item, i, obj) => {
        return item.label === qp.value;
      });
      if (!exactLabel && qp.value) {
        const newItems = Object.assign([], qpItems);
        newItems.push({label: qp.value, detail: '\n'});
        qp.items = newItems;
      } else {
        qp.items = qpItems;
      }
    });
    qp.show();
  });
}

export function activate(context: vscode.ExtensionContext) {
  extContext = context;
}
