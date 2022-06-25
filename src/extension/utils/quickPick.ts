import type { QuickPick, QuickPickItem } from 'vscode';
import { Location, QuickPickItemKind, window, workspace } from 'vscode';
import { assert } from '../../library/exception';
import {
  handleAsyncStd,
  handleErrors,
  handleErrorsAsync,
} from '../modules/exception';
import { getActiveTextEditor } from '../modules/utils';
import { showTextDocument } from './window';

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

export class QuickPickSeparator implements QuickPickItem {
  kind: QuickPickItemKind = QuickPickItemKind.Separator;
  constructor(public label: string) {}
}

/**
 * Subset of {@link QuickPickItem}
 */
export interface BaseQuickPickItem {
  label: string;
  description?: string;
  detail?: string;
}

interface QuickPickLocation<T> extends BaseQuickPickItem {
  location: Location;
  item: T;
}

/**
 * Quick pick tailored for locations.
 *
 * - For obtaining location and quick pick details from item, you must define
 * `toQuickPickItem` and `toLocation`.
 * - Then use one of methods to set items.
 * - In the end use `showModal` to show the quick pick and return selected item.
 */
export class QuickPickLocations<T> {
  private qp: QuickPick<QuickPickLocation<T> | QuickPickSeparator>;

  // must initialize before setting items
  toQuickPickItem!: (item: T) => BaseQuickPickItem;
  toLocation!: (item: T) => Location;

  constructor() {
    this.qp = window.createQuickPick();
    this.qp.onDidChangeActive(
      handleErrorsAsync(this.onDidChanceActive.bind(this)),
    );
  }

  /**
   * Set items which already include separators.
   *
   * No further reordering is done.
   */
  setSeparatedItems(items: ReadonlyArray<T | QuickPickSeparator>) {
    const wrapped = items.map((item) =>
      item instanceof QuickPickSeparator
        ? item
        : {
            item,
            location: this.toLocation(item),
            ...this.toQuickPickItem(item),
          },
    );
    this.qp.items = wrapped;
  }

  /**
   * Set items.
   * Groups locations by file.
   */
  setItems(items: readonly T[]) {
    const wrapped = items.map((item) => ({
      item,
      location: this.toLocation(item),
      ...this.toQuickPickItem(item),
    }));
    wrapped.sort((a, b) => Location.compare(a.location, b.location));

    const groups = wrapped.group((a, b) =>
      a.location.uri.equals(b.location.uri),
    );
    const separated: Array<QuickPickLocation<T> | QuickPickSeparator> = [];
    for (const group of groups) {
      separated.push(
        new QuickPickSeparator(workspace.asRelativePath(group[0].location.uri)),
        ...group,
      );
    }
    this.qp.items = separated;
  }

  /**
   * Choose active item to be near current editor location.
   * If no editor active does nothing.
   */
  adjustActiveItem() {
    const editor = window.activeTextEditor;
    if (!editor) return;
    let active = this.qp.items[0];
    for (const item of this.qp.items) {
      if (item instanceof QuickPickSeparator) continue;
      const loc = item.location;
      if (
        loc.uri.equals(editor.document.uri) &&
        loc.range.start.isBeforeOrEqual(editor.selection.active)
      )
        active = item;
    }
    this.qp.activeItems = [active];
  }

  /**
   * Show modal quick pick. Return selected item of `undefined` if cancelled.
   */
  async showModal(): Promise<T | undefined> {
    const editor = getActiveTextEditor();
    const selection = editor.selection;
    let didAccept = false;
    return new Promise<T | undefined>((resolve) => {
      this.qp.onDidHide(
        handleErrors(() => {
          if (!didAccept) {
            handleAsyncStd(
              window
                .showTextDocument(editor.document, { selection })
                .then(() => {
                  resolve(undefined);
                }),
            );
          }
        }),
      );
      this.qp.onDidAccept(
        handleErrorsAsync(async () => {
          didAccept = true;
          const items = this.qp.activeItems;
          assert(items.length === 1);
          const item = items[0];
          assert(!(item instanceof QuickPickSeparator));
          await window.showTextDocument(item.location.uri, {
            selection: item.location.range,
          });
          resolve(item.item);
        }),
      );
      this.qp.show();
    });
  }

  // eslint-disable-next-line class-methods-use-this
  private async onDidChanceActive(activeItems: typeof this.qp.items) {
    if (activeItems.isEmpty) return;
    assert(activeItems.length === 1);
    const item = activeItems[0];
    assert(!(item instanceof QuickPickSeparator));
    await showTextDocument(item.location.uri, {
      preserveFocus: true,
      preview: true,
      selection: item.location.range,
    });
  }
}
