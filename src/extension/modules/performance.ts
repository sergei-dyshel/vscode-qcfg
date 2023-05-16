import type { ExtensionContext } from 'vscode';
import { Modules } from './module';

import {
  dumpPerfHistograms,
  startPerfObserver,
} from '../../library/performance';
import { UserCommands } from '../../library/userCommands';
import { showLog } from './logging';

function activate(_: ExtensionContext) {
  startPerfObserver();
}

UserCommands.register({
  command: 'qcfg.perf.dumpHistograms',
  title: 'Dump performance histograms',
  callback: () => {
    dumpPerfHistograms();
    showLog();
  },
});

Modules.register(activate);
