import type { ExtensionContext } from 'vscode';
import { window } from 'vscode';
import { Logger } from '../../library/logging';
import {
  createSeparatedQuickPickItems,
  GenericQuickPick,
} from '../utils/quickPick';
import {
  PersistentInputHistoryQuickPick,
  PersistentStringQuickPick,
} from '../utils/quickPickPersistent';
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { showLog } from './logging';
import { Modules } from './module';

const log = new Logger({ name: 'quickPickDemo' });

async function demoOrigShowQuickPick() {
  showLog();
  const selected = await window.showQuickPick(['one', 'two', 'three'], {
    // canPickMany: true,
    onDidSelectItem: (item: string) => {
      log.debug(`onDidSelect ${item}`);
    },
  });
  if (selected) log.debug(`Selected ${selected}`);
  else log.debug('cancelled');
}

async function demoPersistentStringQuickPick() {
  const qp = new PersistentStringQuickPick('demoPersistentStringQuickPick', [
    'one',
    'two',
    'three',
    'four',
  ]);
  const selected = await qp.select();
  log.debug('selected', selected);
}

function demoOrigQuickPick() {
  showLog();
  const qp = window.createQuickPick();
  qp.items = createSeparatedQuickPickItems({
    small: ['one', 'two', 'tree'].map((label) => ({ label })),
    big: ['eleven', 'twelve', 'thirteen', 'twenty one', 'twenty'].map(
      (label) => ({ label }),
    ),
  });
  qp.activeItems = [qp.items[1]];
  qp.selectedItems = [qp.items[1]];
  qp.ignoreFocusOut = true;
  qp.sortByLabel = false;
  qp.enabled = false;
  // qp.canSelectMany = true;
  qp.onDidChangeActive((active) => {
    log.debug('active', active);
  });
  qp.onDidChangeSelection((selection) => {
    log.debug('selection', selection);
  });
  qp.onDidAccept(() => {
    log.debug(
      'accepted active:',
      qp.activeItems,
      'selected:',
      qp.selectedItems,
      'value:',
      qp.value,
    );
  });
  qp.onDidHide(() => {
    log.debug('hidden');
  });
  qp.show();
}

async function demoGenericQuickPick() {
  const qp = new GenericQuickPick<string>(
    (value: string) => ({
      label: value,
      detail: value,
    }),
    ['one', 'two', 'three'],
  );
  qp.selectedItems = ['two'];
  qp.selectedItem = 'two';
  qp.activeItem = 'two';
  qp.onDidActivateItem = (val) => {
    log.debug('activated', val);
  };
  const selected = await qp.select();
  if (selected) {log.debug('selected', selected);}
  else {log.debug('cancelled');}
}

async function demoStringHistory() {
  const qp = new PersistentInputHistoryQuickPick('demoStringHistory');
  const selected = await qp.select();
  if (selected) log.debug('selected', selected);
  else log.debug('cancelled');
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped(
      'qcfg.demo.origShowQuickPick',
      demoOrigShowQuickPick,
    ),
    registerSyncCommandWrapped('qcfg.demo.origQuickPick', demoOrigQuickPick),
    registerAsyncCommandWrapped(
      'qcfg.demo.genericQuickPick',
      demoGenericQuickPick,
    ),
    registerAsyncCommandWrapped(
      'qcfg.demo.stringHistoryQuickPick',
      demoStringHistory,
    ),
    registerAsyncCommandWrapped(
      'qcfg.demo.demoPersistentStringQuickPick',
      demoPersistentStringQuickPick,
    ),
  );
}

Modules.register(activate);
