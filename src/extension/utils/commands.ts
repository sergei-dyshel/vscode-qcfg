import { commands } from 'vscode';
import type { DisposableLike } from '../../library/disposable';
import { UserCommands } from '../../library/userCommands';

export function registerAllCommands(): DisposableLike[] {
  return UserCommands.all.map((cmd) =>
    commands.registerCommand(cmd.command, cmd.callback),
  );
}
