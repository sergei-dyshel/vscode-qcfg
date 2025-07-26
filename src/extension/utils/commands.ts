import type { DisposableLike } from "@sergei-dyshel/vscode";
import { commands } from "vscode";
import { UserCommands } from "../../library/userCommands";

export function registerAllCommands(): DisposableLike[] {
  return UserCommands.all.map((cmd) =>
    commands.registerCommand(cmd.command, cmd.callback),
  );
}
