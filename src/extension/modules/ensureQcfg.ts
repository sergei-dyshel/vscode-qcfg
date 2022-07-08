import type { ExtensionContext } from 'vscode';
import { commands } from 'vscode';
import { log } from '../../library/logging';
import { process } from '../../library/nodejs';
import { MessageDialog } from '../utils/messageDialog';
import { handleAsyncStd } from './exception';
import { Modules } from './module';

async function run() {
  const ans = await MessageDialog.showModal(
    MessageDialog.ERROR,
    'VScode is running not inside QCFG environment. Exit?',
    ['yes', 'no'] as const,
  );
  if (ans === 'yes') {
    await commands.executeCommand('workbench.action.quit');
  }
}

function activate(_: ExtensionContext) {
  if (!process.env['QCFG_ROOT']) {
    handleAsyncStd(run());
  } else {
    log.info('QCFG_ROOT = ', process.env['QCFG_ROOT']);
  }
}

Modules.register(activate);
