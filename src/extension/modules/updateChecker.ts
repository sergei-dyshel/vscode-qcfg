import type { ExtensionContext } from 'vscode';
import { commands, Uri, window, workspace } from 'vscode';
import { log } from '../../library/logging';
import { discardReturn } from '../../library/templateTypes';
import { handleAsyncStd, handleErrorsAsync } from './exception';
import { Modules } from './module';

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 min

async function getCurrentVersion(context: ExtensionContext) {
  const stat = await workspace.fs.stat(
    Uri.file(context.extensionUri.fsPath + '/package.json'),
  );
  return stat.ctime;
}

async function run(context: ExtensionContext) {
  const initialVersion = await getCurrentVersion(context);
  log.info(`Current qcfg version (ctime): ${initialVersion}`);

  const interval = setInterval(
    discardReturn(
      handleErrorsAsync(async () => {
        const curVersion = await getCurrentVersion(context);
        if (curVersion === initialVersion) return;
        const answer = await window.showWarningMessage(
          'Qcfg extension was updated. Reload window?',
          'YES',
          'NO',
        );
        if (answer === 'YES')
          return commands.executeCommand('workbench.action.reloadWindow');
        clearInterval(interval);
      }),
    ),
    POLL_INTERVAL_MS,
  );
}

function activate(context: ExtensionContext) {
  handleAsyncStd(run(context));
}

Modules.register(activate);
