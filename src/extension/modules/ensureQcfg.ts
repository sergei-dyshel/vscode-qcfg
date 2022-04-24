import type { ExtensionContext } from 'vscode';
import { commands, window } from 'vscode';
import { log } from '../../library/logging';
import { process } from '../../library/nodejs';
import { handleAsyncStd } from './exception';
import { Modules } from './module';

async function run() {
  const ans = await window.showErrorMessage(
    'VScode is running not inside QCFG environment. Exit?',
    { modal: true },
    'yes',
    'no',
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
