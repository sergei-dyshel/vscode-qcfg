'use strict';

import * as vscode from 'vscode';
import {window, Uri, QuickPickItem} from 'vscode';
import { removeFirstFromArray } from './tsUtils';
import { handleErrors } from './exception';

// export function selectFromList<T extends QuickPickItem>(
//     items: T[], options?: vscode.QuickPickOptions): Thenable<T|undefined> {

let extContext: vscode.ExtensionContext;

export async function inputWithHistory(persistentKey: string):
    Promise<string|undefined> {
  const items: string[] = extContext.globalState.get(persistentKey, []);
  const qp = window.createQuickPick();
  const qpItems: QuickPickItem[] = items.map((x) => ({label: x}));
  qp.items = qpItems;
  qp.buttons = [buttons.REMOVE];

  const selected = await new Promise<string|undefined>((resolve) => {
    const qp = window.createQuickPick();
    const qpItems: QuickPickItem[] = items.map((x) => ({label: x}));
    qp.items = qpItems;
    qp.buttons = [buttons.REMOVE];
    const onDidHideDisposer = qp.onDidHide(handleErrors(() => {
      resolve(undefined);
      qp.dispose();
    }));
    qp.onDidAccept(handleErrors(() => {
      resolve(qp.selectedItems[0].label);
      onDidHideDisposer.dispose();
      qp.hide();
      qp.dispose();
    }));
    qp.onDidTriggerButton(handleErrors((button: Button) => {
      if (button === buttons.REMOVE) {
        if (!qp.activeItems)
          return;
        const active = qp.activeItems[0];
        if ('detail' in active)
          return;
        if (!removeFirstFromArray(qpItems, active))
          return;
        extContext.globalState.update(
            persistentKey, qpItems.map((item) => item.label));
        const newItems = Object.assign([], qpItems);
        if (active.detail)
          newItems.push(active);
        qp.items = newItems;
      }
    }));
    qp.onDidChangeValue(handleErrors(() => {
      const exactLabel = qp.items.find((item) => {
        return item.label === qp.value;
      });
      if (!exactLabel && qp.value) {
        const newItems = Object.assign([], qpItems);
        newItems.push({label: qp.value, detail: '\n'});
        qp.items = newItems;
      } else {
        qp.items = qpItems;
      }
    }));
    qp.show();
  });
  if (!selected)
    return;
  const newItems = items.filter((x) => x !== selected);
  newItems.unshift(selected);
  extContext.globalState.update(persistentKey, newItems);
  return selected;
}

class Button implements vscode.QuickInputButton {
  constructor(path: string, public tooltip?: string) {
    this.iconPath = Uri.file(extContext.asAbsolutePath(path));
  }
  iconPath: Uri;
}

const buttons: {[name: string]: Button} = {};

export function activate(context: vscode.ExtensionContext) {
  extContext = context;
  buttons.REMOVE = new Button('icons/remove-dark.svg', 'Remove');
}

export async function selectFromList<T>(
    items: T[], toQuickPickItem: (x: T) => QuickPickItem,
    options?: vscode.QuickPickOptions): Promise<T|undefined> {
  const qpItems =
      items.map((item) => ({'item': item, ...toQuickPickItem(item)}));
  const selected = await window.showQuickPick(qpItems, options);
  if (selected)
    return selected.item;
  return;
}

export async function selectStringFromList(
    items: string[],
    options?: vscode.QuickPickOptions): Promise<string|undefined> {
  return selectFromList(items, label => ({label}), options);
}

export async function selectFromListMru<T>(
    items: T[], toQuickPickItem: (x: T) => QuickPickItem, persistentKey: string,
    toPersistentLabel: (x: T) => string,
    options?: vscode.QuickPickOptions): Promise<T|undefined> {
  const labels: string[] = extContext.globalState.get(persistentKey, []);
  const mruItems = items.map((item, origIndex) => {
    let index = labels.indexOf(toPersistentLabel(item));
    if (index === -1)
      index = origIndex + labels.length;
    return {item, index};
  });
  mruItems.sort(
      (x, y) =>
          (y.index === -1 ? -1 : (x.index === -1 ? 1 : x.index - y.index)));
  const selectedMru = await selectFromList(
      mruItems, (item) => toQuickPickItem(item.item), options);
  if (!selectedMru)
    return;
  const selected = selectedMru.item;
  if (selectedMru.index !== -1)
    labels.splice(selectedMru.index, 1);
  labels.unshift(toPersistentLabel(selected));
  extContext.globalState.update(persistentKey, labels);
  return selected;
}

export interface ListSelectable {
  toQuickPickItem: () => QuickPickItem;
  toPersistentLabel: () => string;
}

export async function selectMultiple<T>(
    items: T[], toQuickPickItem: (x: T) => QuickPickItem, persistentKey: string,
    toPersistentLabel: (x: T) => string,
    options?: vscode.QuickPickOptions): Promise<T[]|undefined> {
  const previouslySelected: string[] =
      extContext.globalState.get(persistentKey, []);
  const qpItems =
      items.map((item) => ({
                  ...toQuickPickItem(item),
                  item,
                  picked: previouslySelected.includes(toPersistentLabel(item))
                }));
  const selected =
      await window.showQuickPick(qpItems, {...options, canPickMany: true});
  if (selected) {
    extContext.globalState.update(
        persistentKey, selected.map(qpItem => toPersistentLabel(qpItem.item)));
    return selected.map(qpitem => qpitem.item);
  }
}

export async function selectObjectFromListMru<T extends ListSelectable>(
    items: T[], persistentKey: string,
    options?: vscode.QuickPickOptions): Promise<T|undefined> {
  return selectFromListMru(
      items, (item: T) => item.toQuickPickItem(), persistentKey,
      (item: T) => item.toPersistentLabel(), options);
}

export async function selectStringFromListMru(
    items: string[], persistentKey: string,
    options?: vscode.QuickPickOptions): Promise<string|undefined> {
  return selectFromListMru(
      items, (label) => ({label}), persistentKey, (label) => label, options);
}
