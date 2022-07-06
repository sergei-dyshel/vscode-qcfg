import type {
  Event,
  QuickInputButton,
  QuickPick,
  QuickPickItem,
  QuickPickItemButtonEvent,
} from 'vscode';
import {
  Disposable,
  Location,
  QuickPickItemKind,
  window,
  workspace,
} from 'vscode';
import { assert, assertNotNull, notNull } from '../../library/exception';
import { MultiDisposableHolder } from '../../library/types';
import {
  handleAsyncStd,
  handleErrors,
  handleErrorsAsync,
  listenWrapped,
} from '../modules/exception';
import { getActiveTextEditor } from '../modules/utils';
import { showTextDocument } from './window';

/**
 * Show given QuickPick and return whether user accepted or cancelled.
 *
 * @param mustSelect Only selected entries can be accepted.
 * Otherwise {@link QuickPick.value} that does not match any items will also be accepted.
 *
 * If user accepted use {@link QuickPick.selectedItems}.
 */
export async function showQuickPick<T extends QuickPickItem>(
  qp: QuickPick<T>,
  mustSelect = true,
) {
  let didAccept = false;
  return new Promise<boolean>((resolve) => {
    const disposer = Disposable.from(
      qp.onDidAccept(
        handleErrors(() => {
          if (qp.selectedItems.isEmpty && mustSelect) return;
          didAccept = true;
          resolve(true);
          qp.hide();
        }),
      ),
      qp.onDidHide(
        handleErrors(() => {
          if (!didAccept) resolve(false);
          disposer.dispose();
        }),
      ),
    );
    qp.show();
  });
}

interface QuickPickValue<T> extends QuickPickItem {
  value: T;
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
  buttons?: readonly QuickInputButton[];
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
    this.qp.sortByLabel = false;
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

/**
 * Create QuickPick of given item type.
 *
 * Behaves similarly to {@link window.createQuickPick}.
 */
export function createQuickPick<T extends QuickPickItem>() {
  return new QuickPickWrapper<T>(
    (value: T) => value,
    (item: QuickPickItem) => item as T,
    (item: QuickPickItem, value: T) => item === value,
  );
}

/**
 * Create QuickPick for items of any type.
 */
export function createAnyQuickPick<T>(
  toQuickPickItem: (value: T) => BaseQuickPickItem | string,
) {
  return new QuickPickWrapper<T>(
    (value: T) => {
      const item = toQuickPickItem(value);
      if (typeof item === 'string') return { value, label: item };
      return { value, ...item };
    },
    (item: QuickPickItem) => (item as QuickPickValue<T>).value,
    (item: QuickPickItem, value: T) =>
      (item as QuickPickValue<T>).value === value,
  );
}

/**
 * Universal wrapper for {@link QuickPick}.
 *
 * Instead of requiring item type to extend {@link QuickPickItem} it can use
 * any type by providing converters.
 *
 * NOTE: Manipulation with items uses boxing/unboxing and iteration
 * so the implementation is not suitable for QuickPicks with large number of items.
 */
export class QuickPickWrapper<T> extends MultiDisposableHolder {
  protected readonly qp: QuickPick<QuickPickItem>;

  /**
   * Do not dispose QuickPick after it's hidden.
   */
  keepAlive?: boolean;

  constructor(
    /** Converter from value to *QuickPickItem* */
    protected toQuickPickItem: (value: T) => BaseQuickPickItem,

    /**
     * Converter back from *QuickPickItem* to value type
     *
     * One can assume that will be called only on items obtained with {@link toQuickPickItem}
     */
    protected fromQuickPickItem: (item: QuickPickItem) => T,

    /** Check if value is equal to one from which *QuickPickItem* was obtained by {@link toQuickPickItem} */
    protected isEqual: (item: QuickPickItem, value: T) => boolean,
  ) {
    super();
    this.qp = window.createQuickPick<QuickPickItem>();
    this.disposables.push(this.qp);
  }

  /**
   * Proxy object to set options of underlying {@link QuickPick}.
   */
  get options(): {
    // Inherited from QuickInput
    title: string | undefined;
    ignoreFocusOut: boolean;

    value: string;
    placeholder: string | undefined;
    canSelectMany: boolean;
    matchOnDescription: boolean;
    matchOnDetail: boolean;
    keepScrollPosition?: boolean;

    // proposedAPI
    sortByLabel?: boolean;

    readonly onDidChangeValue: Event<string>;
    buttons: readonly QuickInputButton[];
    readonly onDidTriggerButton: Event<QuickInputButton>;
  } {
    return this.qp;
  }

  /**
   * Callback called when another item is activated, either by moving cursor or by ticking checkbox.
   */
  set onDidActivateItem(cb: (value: T) => void | Promise<void>) {
    this.disposables.push(
      this.qp.onDidChangeActive(
        handleErrors((activeItems: readonly QuickPickItem[]) => {
          if (activeItems.isEmpty) return;
          assert(
            activeItems.length === 1,
            'multiple items are activated in QuickPick',
          );
          return cb(this.fromQuickPickItem(activeItems[0]));
        }),
      ),
    );
  }

  /**
   * See {@link QuickPick.onDidTriggerItemButton}.
   *
   * Can be either sync or async function.
   */
  set onDidTriggerItemButton(
    cb: (item: T, button: QuickInputButton) => void | Promise<void>,
  ) {
    this.disposables.push(
      listenWrapped(
        this.qp.onDidTriggerItemButton,
        (event: QuickPickItemButtonEvent<QuickPickItem>) =>
          cb(this.fromQuickPickItem(event.item), event.button),
      ),
    );
  }

  set onDidTriggerButton(
    cb: (button: QuickInputButton) => void | Promise<void>,
  ) {
    this.disposables.push(listenWrapped(this.qp.onDidTriggerButton, cb));
  }

  /**
   * QuickPick items. Only allows setting.
   */
  set items(values: ReadonlyArray<T | QuickPickSeparator>) {
    this.qp.items = values.map((value) =>
      value instanceof QuickPickSeparator ? value : this.toQuickPickItem(value),
    );
  }

  /**
   * Active item, which was selected either with arrows or by click on checkbox.
   *
   * Supports only setting. Use {@link onDidActivateItem} to track value;
   */
  set activeItem(value: T) {
    const active = this.qp.items.firstOf((item) => this.isEqual(item, value));
    assertNotNull(active);
    this.qp.activeItems = [active];
  }

  /** Set or set selected items */
  set selectedItems(values: readonly T[]) {
    this.qp.selectedItems = values.map((value) =>
      notNull(this.qp.items.firstOf((item) => this.isEqual(item, value))),
    );
  }

  get selectedItems(): readonly T[] {
    return this.qp.selectedItems.map(this.fromQuickPickItem);
  }

  /**
   * Set or get single select item
   *
   * Getter is only applicable to single-select QuickPicks.
   */
  set selectedItem(value: T | undefined) {
    if (value === undefined) this.selectedItems = [];
    else this.selectedItems = [value];
  }

  get selectedItem(): T | undefined {
    assert(!this.options.canSelectMany, 'used on multi-select QuickPick');
    const selected = this.selectedItems;
    if (selected.isEmpty) return;
    assert(selected.length === 1);
    return selected[0];
  }

  /**
   * Show QuickPick and let user select one item.
   * @returns selected item or *undefined* otherwise
   *
   * Automatically sets {@link QuickPick.canSelectMany} to **false**
   */
  async select(): Promise<T | undefined> {
    this.options.canSelectMany = false;
    const selected = await this.selectImpl();
    if (selected) return selected[0];
    return;
  }

  /**
   * Show QuickPick and let user select multiple items.
   * @returns selected items or *undefined* otherwise
   *
   * Automatically sets {@link QuickPick.canSelectMany} to **true**
   */
  async selectMany(): Promise<readonly T[] | undefined> {
    this.options.canSelectMany = true;
    return this.selectImpl();
  }

  private async selectImpl(): Promise<readonly T[] | undefined> {
    const accepted = await showQuickPick(this.qp);
    if (!this.keepAlive) this.dispose();
    if (accepted) return this.selectedItems;
    return;
  }
}

/**
 * Create QuickPick for string items.
 *
 * Similar to {@link showQuickPick} specialized for strings.
 */
export class StringQuickPick extends QuickPickWrapper<string> {
  constructor() {
    super(
      (value: string) => ({ label: value }),
      (item: QuickPickItem) => item.label,
      (item: QuickPickItem, value: string) => item.label === value,
    );
  }
}
