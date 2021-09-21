'use strict';

import * as lodash from 'lodash';
import type {
  ExtensionContext,
  QuickInputButton,
  QuickPickItem,
  QuickPickOptions,
} from 'vscode';
import { Uri, window } from 'vscode';
import { handleAsyncStd, handleErrors, handleErrorsAsync } from './exception';
import { Modules } from './module';

// export function selectFromList<T extends QuickPickItem>(
//     items: T[], options?: QuickPickOptions): Thenable<T|undefined> {

let extContext: ExtensionContext;

export async function inputWithHistory(
  persistentKey: string,
): Promise<string | undefined> {
  const items: string[] = extContext.globalState.get(persistentKey, []);
  const quickPick = window.createQuickPick();
  quickPick.items = items.map((x) => ({ label: x }));
  quickPick.buttons = [buttons['REMOVE']];

  const selected = await new Promise<string | undefined>((resolve) => {
    const qp = window.createQuickPick();
    const qpItems: QuickPickItem[] = items.map((x) => ({ label: x }));
    qp.items = qpItems;
    qp.buttons = [buttons['REMOVE']];
    const onDidHideDisposer = qp.onDidHide(
      handleErrors(() => {
        resolve(undefined);
        qp.dispose();
      }),
    );
    qp.onDidAccept(
      handleErrors(() => {
        resolve(qp.selectedItems[0].label);
        onDidHideDisposer.dispose();
        qp.hide();
        qp.dispose();
      }),
    );
    qp.onDidTriggerButton(
      handleErrorsAsync(async (quickInputButton: QuickInputButton) => {
        const button = quickInputButton as Button;
        if (button !== buttons['REMOVE']) {
          return;
        }
        const active = qp.activeItems[0];
        if ('detail' in active) return;
        if (!qpItems.removeFirst(active)) return;
        await extContext.globalState.update(
          persistentKey,
          qpItems.map((item) => item.label),
        );
        const newItems = Object.assign([], qpItems);
        if (active.detail) newItems.push(active);
        qp.items = newItems;
      }),
    );
    qp.onDidChangeValue(
      handleErrors(() => {
        const exactLabel = qp.items.find((item) => item.label === qp.value);
        if (!exactLabel && qp.value) {
          const newItems = Object.assign([], qpItems);
          newItems.push({ label: qp.value, detail: '\n' });
          qp.items = newItems;
        } else {
          qp.items = qpItems;
        }
      }),
    );
    qp.show();
  });
  if (!selected) return;
  const nonSelected = items.filter((x) => x !== selected);
  nonSelected.unshift(selected);
  await extContext.globalState.update(persistentKey, nonSelected);
  return selected;
}

class Button implements QuickInputButton {
  constructor(path: string, public tooltip?: string) {
    this.iconPath = Uri.file(extContext.asAbsolutePath(path));
  }

  iconPath: Uri;
}

const buttons: Record<string, Button> = {};

export interface BaseQuickPickOptions {
  matchOnDescription?: boolean;
  matchOnDetail?: boolean;
  placeHolder?: string;
  ignoreFocusOut?: boolean;
}

export async function selectFromList<T>(
  items: T[],
  toQuickPickItem: (x: T) => QuickPickItem,
  options?: BaseQuickPickOptions,
  onItemSelected?: (item: T) => void,
): Promise<T | undefined> {
  const qpItems = items.map((item) => ({ item, ...toQuickPickItem(item) }));
  const onDidSelectItem = onItemSelected
    ? (qpItem: QuickPickItem) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onItemSelected((qpItem as any).item as T);
      }
    : undefined;
  const selected = await window.showQuickPick(qpItems, {
    ...options,
    onDidSelectItem,
  });
  if (selected) return selected.item;
  return;
}

export async function selectMultipleFromList<T>(
  items: T[],
  toQuickPickItem: (x: T) => QuickPickItem,
  options?: BaseQuickPickOptions,
  onItemSelected?: (item: T) => void,
): Promise<T[] | undefined> {
  const qpItems = items.map((item) => ({ item, ...toQuickPickItem(item) }));
  const onDidSelectItem = onItemSelected
    ? (qpItem: QuickPickItem) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onItemSelected((qpItem as any).item as T);
      }
    : undefined;
  const selected = await window.showQuickPick(qpItems, {
    ...options,
    onDidSelectItem,
    canPickMany: true,
  });
  if (selected) return selected.map((qpItem) => qpItem.item);
  return;
}

export async function selectStringFromList(
  items: string[],
  options?: QuickPickOptions,
): Promise<string | undefined> {
  return selectFromList(items, (label) => ({ label }), options);
}

export async function selectFromListMru<T>(
  items: T[],
  toQuickPickItem: (x: T) => QuickPickItem,
  persistentKey: string,
  toPersistentLabel: (x: T) => string,
  options?: QuickPickOptions,
): Promise<T | undefined> {
  const labels: string[] = extContext.globalState.get(persistentKey, []);
  let mruItems = items.map((item, origIndex) => {
    let index = labels.indexOf(toPersistentLabel(item));
    if (index === -1) index = origIndex + labels.length;
    return { item, index };
  });
  mruItems = lodash.sortBy(mruItems, (x) => x.index);
  // mruItems.sort((x, y) => (x.index - y.index));
  const selectedMru = await selectFromList(
    mruItems,
    (item) => toQuickPickItem(item.item),
    options,
  );
  if (!selectedMru) return;
  const selected = selectedMru.item;
  if (selectedMru.index !== -1) labels.splice(selectedMru.index, 1);
  labels.unshift(toPersistentLabel(selected));
  handleAsyncStd(extContext.globalState.update(persistentKey, labels));
  return selected;
}

export interface ListSelectable {
  toQuickPickItem: () => QuickPickItem;
  toPersistentLabel: () => string;
}

export async function selectMultiple<T>(
  items: T[],
  toQuickPickItem: (x: T) => QuickPickItem,
  persistentKey: string,
  toPersistentLabel: (x: T) => string,
  options?: QuickPickOptions,
): Promise<T[] | undefined> {
  const previouslySelected: string[] = extContext.globalState.get(
    persistentKey,
    [],
  );
  const qpItems = items.map((item) => ({
    ...toQuickPickItem(item),
    item,
    picked: previouslySelected.includes(toPersistentLabel(item)),
  }));
  const selected = await window.showQuickPick(qpItems, {
    ...options,
    canPickMany: true,
  });
  if (selected) {
    await extContext.globalState.update(
      persistentKey,
      selected.map((qpItem) => toPersistentLabel(qpItem.item)),
    );
    return selected.map((qpitem) => qpitem.item);
  }
  return undefined;
}

export async function selectObjectFromListMru<T extends ListSelectable>(
  items: T[],
  persistentKey: string,
  options?: QuickPickOptions,
): Promise<T | undefined> {
  return selectFromListMru(
    items,
    (item: T) => item.toQuickPickItem(),
    persistentKey,
    (item: T) => item.toPersistentLabel(),
    options,
  );
}

export async function selectStringFromListMru(
  items: string[],
  persistentKey: string,
  options?: QuickPickOptions,
): Promise<string | undefined> {
  return selectFromListMru(
    items,
    (label) => ({ label }),
    persistentKey,
    (label) => label,
    options,
  );
}

function activate(context: ExtensionContext) {
  extContext = context;
  buttons['REMOVE'] = new Button('icons/remove-dark.svg', 'Remove');
}

Modules.register(activate);
