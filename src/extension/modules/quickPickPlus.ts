import { Event, EventEmitter, QuickPick, QuickPickItem, window } from 'vscode';
import { assert } from '../../library/exception';

class Item<T> implements QuickPickItem {
  label: string;
  description?: string;
  detail?: string;
  picked?: boolean;
  alwaysShow?: boolean;
  constructor(readonly item: T, toQuickPickItem: (item: T) => QuickPickItem) {
    const qpItem = toQuickPickItem(item);
    this.label = qpItem.label;
    this.description = qpItem.description;
    this.detail = qpItem.detail;
    this.picked = qpItem.picked;
    this.alwaysShow = qpItem.alwaysShow;
  }
}

interface QuickPickPlusSelectionChanged<T> {
  /** Items that were selected/deselected */
  items: T[];
  /** If false, items were deselected */
  selected: boolean;
}

class QuickPickPlus<T> {
  private readonly qp: QuickPick<Item<T>>;
  private readonly selectionEmitter = new EventEmitter<
    QuickPickPlusSelectionChanged<T>
  >();

  readonly onSelectionChanged: Event<QuickPickPlusSelectionChanged<T>>;

  constructor(
    items: T[],
    private readonly toQuickPickItem: (item: T) => QuickPickItem,
    selection: T[],
  ) {
    this.qp = window.createQuickPick<Item<T>>();
    this.qp.items = items.map((item) => {
      const qpItem = new Item<T>(item, this.toQuickPickItem);
      qpItem.picked = selection.includes(item);
      return qpItem;
    });
    this.onSelectionChanged = this.selectionEmitter.event;
    this.prevSelection = this.qp.items.filter((qpitem) => qpitem.picked);
    this.qp.onDidChangeSelection(this.onDidChangeSelection.bind(this));
  }

  private onDidChangeSelection(newSel: Array<Item<T>>) {
    const prevSel = this.prevSelection;
    const selected: T[] = [];
    const deselected: T[] = [];
    let i = 0;
    let j = 0;
    while (i < prevSel.length && j < newSel.length) {
      if (i === prevSel.length) {
        selected.push(newSel[j].item);
        j += 1;
      } else if (j === newSel.length) {
        deselected.push(prevSel[i].item);
        i += 1;
      } else if (prevSel[i] === newSel[j]) {
        i += 1;
        j += 1;
      } else {
        selected.push(newSel[j].item);
        deselected.push(prevSel[i].item);
        i += 1;
        j += 1;
      }
    }

    this.prevSelection = newSel;

    if (selected.isEmpty) {
      this.selectionEmitter.fire({ items: deselected, selected: false });
    } else {
      this.selectionEmitter.fire({ items: selected, selected: true });
    }
  }

  private prevSelection: Array<Item<T>> = [];
}
