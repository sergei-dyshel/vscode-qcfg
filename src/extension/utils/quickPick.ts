import type { QuickPick, QuickPickItem } from 'vscode';
import { window } from 'vscode';

/** Helper interface for *WithValues functions */
export interface QuickPickValue<T> extends QuickPickItem {
  value: T;
}

/**
 * Show QuickPick and return whether user accepted items.
 */
export async function showQuickPick<T extends QuickPickItem>(qp: QuickPick<T>) {
  return new Promise<boolean>((resolve) => {
    qp.onDidAccept(() => {
      resolve(true);
      qp.hide();
    });
    qp.onDidHide(() => {
      resolve(false);
    });
    qp.show();
  });
}

/** Create QuickPick with items of arbitrary type by providing conversion function */
export function createQuickPickWithValues<T>(
  values: T[],
  toQuickPick: (value: T) => QuickPickItem,
): QuickPick<QuickPickValue<T>> {
  const qp = window.createQuickPick<QuickPickValue<T>>();
  qp.items = values.map((value: T) => ({
    value,
    ...toQuickPick(value),
  }));
  return qp;
}

/** Show QuickPick with items created by {@link createQuickPickWithValues} */
export async function showQuickPickWithValues<T>(
  qp: QuickPick<QuickPickValue<T>>,
) {
  if (await showQuickPick(qp)) {
    return qp.selectedItems.map((qpValue) => qpValue.value);
  }
  return undefined;
}
