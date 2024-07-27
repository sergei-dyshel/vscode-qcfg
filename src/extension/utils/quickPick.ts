import type {
  QuickInputButton,
  QuickPick,
  QuickPickItem,
  QuickPickItemButtonEvent,
} from "vscode";
import {
  Disposable,
  Location,
  QuickPickItemKind,
  ThemeIcon,
  window,
  workspace,
} from "vscode";
import { DisposableCollection } from "../../library/disposable";
import { assert, assertNotNull, notNull } from "../../library/exception";
import { listenWrapped } from "../modules/exception";
import { getActiveTextEditor } from "../modules/utils";
import { showTextDocument } from "./window";

export namespace QuickPickButtons {
  /**
   * Create button with {@link ThemeIcon}.
   *
   * Takes built-in icon ID, see
   * https://code.visualstudio.com/api/references/icons-in-labels#icon-listing
   * for full list.
   */
  export function create(
    themeIconId: string,
    tooltip?: string,
  ): QuickInputButton {
    return {
      iconPath: new ThemeIcon(themeIconId),
      tooltip,
    };
  }

  export const REMOVE = create("trash", "Delete");
  export const CLEAR_ALL = create("clear-all", "Clear all");
  export const EDIT = create("edit", "Edit");
}

/**
 * Create list of items to be used with {@link QuickPickWrapper} or
 * {@link QuickPick}.
 *
 * Must be in form of:
 *
 * ```js
 * {
 *   separator_1: [items],
 *   separator_2: [items]
 * }
 * ```
 */
export function createSeparatedQuickPickItems<T>(
  obj: Record<string, T[]>,
): Array<QuickPickSeparator | T> {
  const result: Array<QuickPickSeparator | T> = [];
  for (const [label, items] of Object.entries(obj)) {
    result.push(new QuickPickSeparator(label), ...items);
  }
  return result;
}

export class QuickPickSeparator implements QuickPickItem {
  kind: QuickPickItemKind = QuickPickItemKind.Separator;
  constructor(public label: string) {}
}

export interface QuickPickValue<T> extends QuickPickItem {
  value: T;
}

/**
 * Subset of {@link QuickPickItem} that is used in APIs based on
 * {@link QuickPickWrapper}
 */
export interface BaseQuickPickItem {
  label: string;
  description?: string;
  detail?: string;

  /** Map from buttons to handlers */
  itemButtons?: Map<QuickInputButton, () => void | Promise<void>>;
}

/**
 * Universal wrapper for {@link QuickPick}.
 *
 * Instead of requiring item type to extend {@link QuickPickItem} it can use any
 * type by providing converters.
 *
 * Unlike original `QuickPick` sets {@link QuickPick.sortByLabel} to `false` by
 * default.
 *
 * NOTE: Manipulation with items uses boxing/unboxing and iteration so the
 * implementation is not suitable for QuickPicks with large number of items.
 */
export class QuickPickWrapper<
  T,
  Q extends BaseQuickPickItem,
> extends DisposableCollection {
  protected readonly qp: QuickPick<Q | QuickPickSeparator>;

  private readonly globalButtons = new Map<
    QuickInputButton,
    () => void | Promise<void>
  >();

  private readonly commonItemButtons = new Map<
    QuickInputButton,
    (_: T) => void | Promise<void>
  >();

  /**
   * Do not dispose QuickPick after it's hidden.
   */
  keepAlive?: boolean;

  constructor(
    protected readonly wrap: (value: T) => Q,
    protected readonly unwrap: (item: Q) => T,
    items?: ReadonlyArray<T | QuickPickSeparator>,
  ) {
    super();
    this.qp = window.createQuickPick<Q | QuickPickSeparator>();
    this.options.sortByLabel = false;
    if (items) this.items = items;
    this.disposables.push(
      this.qp,
      listenWrapped(
        this.qp.onDidTriggerButton,
        this.onDidTriggerButtonImpl.bind(this),
      ),
      listenWrapped(
        this.qp.onDidTriggerItemButton,
        this.onDidTriggerItemButtonImpl.bind(this),
      ),
    );
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

    /**
     * Proposed API (see {@link QuickPick.sortByLabel}).
     *
     * NOTE: False by default unlike in orig QuickPick.
     */
    sortByLabel: boolean;
  } {
    return this.qp;
  }

  /**
   * Add global button and callback.
   */
  addButton(button: QuickInputButton, cb: () => void | Promise<void>) {
    this.globalButtons.set(button, cb);
    this.qp.buttons = [...this.globalButtons.keys()];
  }

  /**
   * Add common per-item button to all items
   *
   * Must be called before setting `items`. These buttons will be shown after
   * {@link BaseQuickPickItem.itemButtons}
   */
  addCommonItemButton(
    button: QuickInputButton,
    cb: (_: T) => void | Promise<void>,
  ) {
    assert(
      this.qp.items.isEmpty,
      "Adding item button after setting `items` - probably bug",
    );
    this.commonItemButtons.set(button, cb);
  }

  /**
   * Callback called when another item is activated, either by moving cursor or
   * by ticking checkbox.
   */
  set onDidActivateItem(cb: (value: T) => void | Promise<void>) {
    this.disposables.push(
      listenWrapped(this.qp.onDidChangeActive, (activeItems) => {
        if (activeItems.isEmpty) return;
        assert(
          activeItems.length === 1,
          "multiple items are activated in QuickPick",
        );
        return cb(this.unwrap(activeItems[0] as Q));
      }),
    );
  }

  set onDidChangeValue(cb: (value: string) => void | Promise<void>) {
    this.disposables.push(listenWrapped(this.qp.onDidChangeValue, cb));
  }

  /**
   * Get or set quickpick items.
   *
   * Acts as proxy to internal {@link QuickPick.items}, applies adapter
   * functions.
   */
  set items(values: ReadonlyArray<T | QuickPickSeparator>) {
    this.qp.items = values.map((value) => {
      if (value instanceof QuickPickSeparator) return value;
      const wrapped = this.wrap(value);
      return {
        ...wrapped,
        buttons: [
          ...(wrapped.itemButtons?.keys() ?? []),
          ...this.commonItemButtons.keys(),
        ],
      };
    });
  }

  get items(): ReadonlyArray<T | QuickPickSeparator> {
    return this.qp.items.map((item) =>
      item instanceof QuickPickSeparator ? item : this.unwrap(item),
    );
  }

  itemsWithoutSeparators(): T[] {
    return this.rawItems().map(this.unwrap);
  }

  /**
   * Active item, which was selected either with arrows or by click on checkbox.
   *
   * Supports only setting. Use {@link onDidActivateItem} to track value;
   */
  set activeItem(value: T) {
    const active = this.qp.items.firstOf(
      (item) =>
        !(item instanceof QuickPickSeparator) && this.unwrap(item) === value,
    );
    assertNotNull(active);
    this.qp.activeItems = [active];
  }

  /** Set or set selected items */
  set selectedItems(values: readonly T[]) {
    this.assertCanSelectMany(true);
    const items = this.rawItems();
    this.qp.selectedItems = values.map((value) =>
      notNull(items.firstOf((item) => this.unwrap(item) === value)),
    );
  }

  get selectedItems(): readonly T[] {
    return this.rawSelectedItems.map(this.unwrap);
  }

  /**
   * Set or get single select item
   *
   * Getter is only applicable to single-select QuickPicks.
   */
  set selectedItem(value: T | undefined) {
    this.assertCanSelectMany(false);
    this.selectedItems = value === undefined ? [] : [value];
  }

  get selectedItem(): T | undefined {
    this.assertCanSelectMany(false);
    const selected = this.selectedItems;
    if (selected.isEmpty) return;
    assert(selected.length === 1);
    return selected[0];
  }

  /**
   * Show QuickPick and let user select one item.
   *
   * @returns Selected item or _undefined_ otherwise
   *
   *   Only works when `canSelectMany = false`.
   */
  async select(): Promise<T | undefined> {
    this.assertCanSelectMany(false);
    const selected = await this.selectImpl();
    if (selected) return selected[0];
    return undefined;
  }

  /**
   * Show QuickPick and let user select multiple items.
   *
   * @returns Selected items or _undefined_ otherwise
   *
   *   Only works when `canSelectMany = true`.
   */
  async selectMany(): Promise<readonly T[] | undefined> {
    this.assertCanSelectMany(true);
    return this.selectImpl();
  }

  /**
   * Just show the QuickPick and run supplied callback when user accepts an
   * item, without closing the QuickPick.
   */
  async showOnly(
    onDidAcceptItem: (item: T) => void | Promise<void>,
  ): Promise<void> {
    await this.selectImpl(onDidAcceptItem);
  }

  private assertCanSelectMany(expected: boolean) {
    assert(
      this.options.canSelectMany === expected,
      `Not supported with canSelectMany == ${this.options.canSelectMany}`,
    );
  }

  protected static filterOutSeparators<T>(
    items: ReadonlyArray<T | QuickPickSeparator>,
  ) {
    return items.filter(
      (item) => !(item instanceof QuickPickSeparator),
    ) as readonly T[];
  }

  /**
   * Underlying QuickPick items, without separators.
   */
  protected rawItems() {
    return QuickPickWrapper.filterOutSeparators(this.qp.items);
  }

  protected get rawSelectedItems() {
    return this.qp.selectedItems as readonly Q[];
  }

  protected get rawActiveitems() {
    return this.qp.selectedItems as readonly Q[];
  }

  private async onDidTriggerButtonImpl(button: QuickInputButton) {
    const cb = this.globalButtons.get(button);
    assert(cb !== undefined);
    await cb();
  }

  private async onDidTriggerItemButtonImpl(
    event: QuickPickItemButtonEvent<Q | QuickPickSeparator>,
  ) {
    assert(!(event.item instanceof QuickPickSeparator));
    const cb = event.item.itemButtons?.get(event.button);
    if (cb) {
      await cb();
      return;
    }
    const commonCb = this.commonItemButtons.get(event.button);
    assert(commonCb !== undefined);
    await commonCb(this.unwrap(event.item));
  }

  /**
   * @param onDidAcceptItem When given, run when user accepts item (presses
   *   ENTER or selects with mouse) without hiding QuickPick, only allow closing
   *   by pressing ESC
   */
  private async selectImpl(
    onDidAcceptItem?: (item: T) => void | Promise<void>,
  ): Promise<readonly T[] | undefined> {
    let didAccept = false;
    const accepted = await new Promise<boolean>((resolve) => {
      const disposer = Disposable.from(
        listenWrapped(this.qp.onDidAccept, async () => {
          if (this.qp.selectedItems.isEmpty) return;
          if (onDidAcceptItem) return onDidAcceptItem(this.selectedItem!);
          didAccept = true;
          resolve(true);
          this.qp.hide();
        }),
        listenWrapped(this.qp.onDidHide, () => {
          if (!didAccept) resolve(false);
          disposer.dispose();
        }),
      );
      this.qp.show();
    });

    if (!this.keepAlive) this.dispose();
    if (accepted) return this.selectedItems;
    return undefined;
  }
}

/**
 * QuickPick for string items
 *
 * Similar to {@link window.showQuickPick} specialized for strings.
 */
export class StringQuickPick extends QuickPickWrapper<
  string,
  { label: string; detail?: string }
> {
  static defaultWrap = (value: string) => ({ label: value });
  static defaultUnwrap = (item: BaseQuickPickItem) => item.label;

  constructor(items?: ReadonlyArray<string | QuickPickSeparator>) {
    super(StringQuickPick.defaultWrap, StringQuickPick.defaultUnwrap, items);
  }
}

/**
 * Create QuickPick for items of any type.
 */
export class GenericQuickPick<T> extends QuickPickWrapper<
  T,
  QuickPickValue<T>
> {
  static createWrap<T, B extends BaseQuickPickItem>(
    wrap: (value: T) => B,
  ): (value: T) => QuickPickValue<T> & B {
    return (value: T): QuickPickValue<T> & B => {
      const item = wrap(value);
      return { value, ...item };
    };
  }

  static defaultUnwrap<T>(item: QuickPickValue<T>) {
    return item.value;
  }

  constructor(
    toQuickPickItem: (value: T) => BaseQuickPickItem,
    /**
     * Sometimes its convenient to pass list of items as parameter to allow
     * vscode auto-infer QuickPick type
     */
    items?: ReadonlyArray<T | QuickPickSeparator>,
  ) {
    super(
      GenericQuickPick.createWrap(toQuickPickItem),
      GenericQuickPick.defaultUnwrap,
      items,
    );
  }
}

/**
 * Quick pick tailored for locations.
 *
 * `toLocation` is only called once per item
 *
 * `select` stays on accepted location otherwise reverts to original location
 */
export class QuickPickLocations<T> extends QuickPickWrapper<
  T,
  QuickPickLocation<T>
> {
  // must initialize before setting items

  constructor(
    toQuickPickItem: (item: T) => BaseQuickPickItem,
    toLocation: (item: T) => Location,
    items?: ReadonlyArray<T | QuickPickSeparator>,
  ) {
    super(
      GenericQuickPick.createWrap((value: T) => ({
        location: toLocation(value),
        ...toQuickPickItem(value),
      })),
      GenericQuickPick.defaultUnwrap,
      items,
    );

    this.disposables.push(
      listenWrapped(
        this.qp.onDidChangeActive,
        QuickPickLocations.onDidChanceActiveImpl,
      ),
    );
  }

  /**
   * Set items. Groups locations by file.
   */
  setAndGroupItems(items: readonly T[]) {
    this.items = items; // will store locations

    const rawItems = [...this.qp.items] as Array<QuickPickLocation<T>>;
    rawItems.sort((a, b) => Location.compare(a.location, b.location));

    const groups = rawItems.group((a, b) =>
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
   * Choose active item to be near current editor location. If no editor active
   * does nothing.
   */
  adjustActiveItem() {
    const editor = window.activeTextEditor;
    if (!editor) return;
    const items = this.qp.items;
    let active = this.qp.items[0];
    for (const item of items) {
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
  override async select(): Promise<T | undefined> {
    const editor = getActiveTextEditor();
    const selection = editor.selection;
    const selected = await super.select();
    if (selected) {
      const rawSelected = this.rawSelectedItems[0];
      await window.showTextDocument(rawSelected.location.uri, {
        selection: rawSelected.location.range,
      });
    } else {
      await window.showTextDocument(editor.document, { selection });
    }
    return selected;
  }

  // eslint-disable-next-line class-methods-use-this
  private static async onDidChanceActiveImpl<T>(
    activeItems: readonly QuickPickItem[],
  ) {
    if (activeItems.isEmpty) return;
    assert(activeItems.length === 1);
    const item = activeItems[0] as QuickPickLocation<T>;
    assert(!(item instanceof QuickPickSeparator));
    await showTextDocument(item.location.uri, {
      preserveFocus: true,
      preview: true,
      selection: item.location.range,
    });
  }
}

interface QuickPickLocation<T> extends QuickPickValue<T> {
  location: Location;
}
