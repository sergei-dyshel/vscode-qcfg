import lodash from 'lodash';
import { assert } from '../../library/exception';
import { MessageDialog } from './messageDialog';
import type { PersistentStorage } from './persistentState';
import { PersistentState } from './persistentState';
import type { BaseQuickPickItem, QuickPickValue } from './quickPick';
import {
  GenericQuickPick,
  QuickPickButtons,
  QuickPickSeparator,
  QuickPickWrapper,
  StringQuickPick,
} from './quickPick';

/**
 * Specialization of {@link QuickPickWrapper} which persists selected items
 * and preselects them on next invokation.
 *
 * The behaviour is differnt depending on `canSelectMany`:
 * - When `false` see {@link PersistentQuickPickWrapper.select}
 * - When `true` see {@link PersistentQuickPickWrapper.selectMany}
 *
 * NOTE: Setting `selectItem` or `selectedItems` is not applicable.
 */
export class PersistentQuickPickWrapper<
  T,
  Q extends BaseQuickPickItem,
> extends QuickPickWrapper<T, Q> {
  protected readonly storage: PersistentStorage<string[]>;

  constructor(
    wrap: (value: T) => Q,
    unwrap: (item: Q) => T,
    protected readonly toPersistentLabel: (value: T) => string,
    persistentKey: string,
  ) {
    super(wrap, unwrap);
    this.storage = new PersistentState<string[]>(persistentKey, []);
  }

  /**
   * Save MRU history of selected items and sort items in MRU order before selecting.
   *
   * NOTE: Separators are unsupported
   */
  override async select(): Promise<T | undefined> {
    const labels: string[] = this.storage.get();
    const items = this.items;
    const mruItems = items.map((item, origIndex) => {
      assert(
        !(item instanceof QuickPickSeparator),
        'Separators unsupported for single-select with because of MRU',
      );
      let index = labels.indexOf(this.toPersistentLabel(item));
      if (index === -1) index = origIndex + labels.length;
      return { item, index };
    });
    this.items = lodash
      .sortBy(mruItems, (x) => x.index)
      .map((item) => item.item);

    const selected = await super.select();
    if (selected) {
      const label = this.toPersistentLabel(selected);
      labels.removeFirst(label);
      labels.unshift(label);
      await this.storage.update(labels);
    }
    return selected;
  }

  /**
   * Will save set of selected items and pre-select them on next invokation.
   */
  override async selectMany(): Promise<readonly T[] | undefined> {
    const labels: string[] = this.storage.get();

    this.selectedItems = QuickPickWrapper.filterOutSeparators(
      this.items,
    ).filter((item) => labels.includes(this.toPersistentLabel(item)));

    const selected = await super.selectMany();
    if (selected) {
      await this.storage.update(selected.map(this.toPersistentLabel));
    }
    return selected;
  }
}

/**
 * Works similarly to {@link GenericQuickPick} but uses persistent storage
 * as described in {@link PersistentQuickPickWrapper}.
 */
export class PersistentGenericQuickPick<T> extends PersistentQuickPickWrapper<
  T,
  QuickPickValue<T>
> {
  constructor(
    toQuickPickItem: (value: T) => BaseQuickPickItem,
    toPersistentLabel: (value: T) => string,
    persistentKey: string,
    /**
     * sometimes its convenient to pass list of items as parameter to allow vscode
     * auto-infer QuickPick type
     */
    items?: ReadonlyArray<T | QuickPickSeparator>,
  ) {
    super(
      GenericQuickPick.createWrap(toQuickPickItem),
      GenericQuickPick.defaultUnwrap,
      toPersistentLabel,
      persistentKey,
    );
    if (items) this.items = items;
  }
}

export class PersistentStringQuickPick extends PersistentQuickPickWrapper<
  string,
  { label: string; detail?: string }
> {
  static defaultToPersistentLabel = (value: string) => value;

  constructor(persistentKey: string, items?: string[]) {
    super(
      StringQuickPick.defaultWrap,
      StringQuickPick.defaultUnwrap,
      PersistentStringQuickPick.defaultToPersistentLabel,
      persistentKey,
    );
    if (items) this.items = items;
  }
}

/**
 * QuickPick that allows to input value and shows MRU history of
 * previously inputted values.
 */
export class PersistentInputHistoryQuickPick extends PersistentStringQuickPick {
  constructor(persistentKey: string) {
    super(persistentKey);

    this.onDidChangeValue = this.onDidChangeValueImpl.bind(this);
    this.addButton(
      QuickPickButtons.CLEAR_ALL,
      this.onDidTriggerClearAll.bind(this),
    );

    this.addCommonItemButton(
      QuickPickButtons.REMOVE,
      this.onDidTriggerRemove.bind(this),
    );
  }

  override async select(): Promise<string | undefined> {
    this.origItems = this.storage.get();
    super.items = this.origItems;
    const selected = await super.select();
    if (selected) {
      const newValues = this.origItems.filter((x) => x !== selected);
      newValues.unshift(selected);
      await this.storage.update(newValues);
    }
    return selected;
  }

  private async onDidTriggerClearAll() {
    const confirmed = await MessageDialog.showModal(
      MessageDialog.WARNING,
      ['Clear all items?', 'Operation is not reversible'],
      ['No', 'Yes'] as const,
      'No',
    );
    if (confirmed === 'No') return;
    this.origItems.clear();
    this.onDidChangeValueImpl(this.qp.value);
  }

  private async onDidTriggerRemove(value: string) {
    const removed = this.origItems.removeFirst(value);
    assert(removed);
    this.onDidChangeValueImpl(this.qp.value);
    await this.storage.update(this.origItems);
  }

  private onDidChangeValueImpl(value: string) {
    if (value === '' || this.origItems.includes(value)) {
      super.items = this.origItems;
      return;
    }
    this.qp.items = [
      // puting newline in `detail` adds space between top (new) item and rest of item
      { label: this.qp.value, detail: '\n' },
      ...this.origItems.map(this.wrap),
    ];
  }

  private origItems!: string[];
}

/**
 * Wrapper to select a record from object with persistence.
 *
 * Use {@link PersistentGenericQuickPick.selectValue} to return only value part of the record.
 */
export class PersistentRecordQuickPick<T> extends PersistentGenericQuickPick<
  [key: string, value: T]
> {
  constructor(persistentKey: string, items?: Record<string, T> & object) {
    super(
      ([key, _value]) => ({ label: key }),
      ([key, _value]) => key,
      persistentKey,
      items ? Object.entries(items) : undefined,
    );
  }

  async selectValue(): Promise<T | undefined> {
    const selected = await this.select();
    return selected ? selected[1] : undefined;
  }
}
