import { commands } from "vscode";
import { UserCommands } from "../../library/userCommands";
import { updateHistory } from "./history";

function registerHistoryWrapCommands(
  ...cmds: Array<
    Omit<UserCommands.Command, "callback"> & {
      wrapped: string;
    }
  >
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
    command: "qcfg.historyWrap.quickOpen",
    title: "Go to file...",
    keybinding: {
      key: "cmd+enter",
      when: "!referenceSearchTreeFocused",
    },
    wrapped: "workbench.action.quickOpen",
  },
  {
    command: "qcfg.historyWrap.openPreviousEditorFromHistory",
    title: "Quick Open Previous Editor from History",
    keybinding: {
      key: "cmd+e",
      when: "editorTextFocus && !inQuickOpen",
    },
    wrapped: "workbench.action.openPreviousEditorFromHistory",
  },
  {
    command: "qcfg.historyWrap.gotoSymbol",
    title: "Go to Symbol in File...",
    keybinding: "cmd+t",
    wrapped: "workbench.action.gotoSymbol",
  },
  {
    command: "qcfg.historyWrap.showAllSymbols",
    title: "Go to Symbol in Workspace...",
    keybinding: "cmd+shift+t",
    wrapped: "workbench.action.showAllSymbols",
  },
);
