import type { ExtensionContext } from 'vscode';
import { commands } from 'vscode';
import type { UserCommandKeybinding } from '../utils/commands';
import { registerUserCommand } from '../utils/commands';
import { updateHistory } from './history';
import { Modules } from './module';

function registerHistoryWrapCommand(cmd: {
  command: string;
  title: string;
  wrapped: string;
  keybinding?: UserCommandKeybinding;
}) {
  return registerUserCommand(command, title, options, async () =>
    updateHistory(commands.executeCommand(origCommand)),
  );
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerHistoryWrapCommand(
      'qcfg.historyWrap.quickOpen',
      'qcfg: Go to file...',
      {
        key: 'cmd+enter',
        when: '!referenceSearchTreeFocused',
      },
      'workbench.action.quickOpen',
    ),
    registerHistoryWrapCommand(
      'qcfg.historyWrap.openPreviousEditorFromHistory',
      'qcfg: Quick Open Previous Editor from History',
      {
        key: 'cmd+e',
        when: 'editorTextFocus && !inQuickOpen',
      },
      'workbench.action.openPreviousEditorFromHistory',
    ),
    registerHistoryWrapCommand(
      'qcfg.historyWrap.gotoSymbol',
      'qcfg: Go to Symbol in File...',
      {
        key: 'cmd+t',
      },
      'workbench.action.gotoSymbol',
    ),
    registerHistoryWrapCommand(
      'qcfg.historyWrap.showAllSymbols',
      'qcfg: Go to Symbol in Workspace...',
      {
        key: 'cmd+shift+t',
      },
      'workbench.action.showAllSymbols',
    ),
  );
}

Modules.register(activate);
