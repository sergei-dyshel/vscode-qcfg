import { commands } from 'vscode';
import { UserCommands } from '../../library/userCommands';
import { updateHistory } from './history';

function registerHistoryWrapCommands(
  ...cmds: Array<{
    command: string;
    title: string;
    wrapped: string;
    keybinding?: UserCommands.Keybinding;
  }>
) {
  UserCommands.register(
    ...cmds.map((cmd) => ({
      command: cmd.command,
      title: cmd.title,
      keybinding: cmd.keybinding,
      callback: async () =>
        updateHistory(commands.executeCommand(cmd.wrapped).ignoreResult()),
    })),
  );
}

registerHistoryWrapCommands(
  {
    command: 'qcfg.historyWrap.quickOpen',
    title: 'qcfg: Go to file...',
    keybinding: {
      key: 'cmd+enter',
      when: '!referenceSearchTreeFocused',
    },
    wrapped: 'workbench.action.quickOpen',
  },
  {
    command: 'qcfg.historyWrap.openPreviousEditorFromHistory',
    title: 'qcfg: Quick Open Previous Editor from History',
    keybinding: {
      key: 'cmd+e',
      when: 'editorTextFocus && !inQuickOpen',
    },
    wrapped: 'workbench.action.openPreviousEditorFromHistory',
  },
  {
    command: 'qcfg.historyWrap.gotoSymbol',
    title: 'qcfg: Go to Symbol in File...',
    keybinding: {
      key: 'cmd+t',
    },
    wrapped: 'workbench.action.gotoSymbol',
  },
  {
    command: 'qcfg.historyWrap.showAllSymbols',
    title: 'qcfg: Go to Symbol in Workspace...',
    keybinding: {
      key: 'cmd+shift+t',
    },
    wrapped: 'workbench.action.showAllSymbols',
  },
);
