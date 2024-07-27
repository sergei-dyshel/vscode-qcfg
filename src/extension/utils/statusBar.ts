import type { StatusBarItem } from "vscode";
import { ThemeColor } from "vscode";

export function setStatusBarErrorBackground(status: StatusBarItem) {
  status.backgroundColor = new ThemeColor("statusBarItem.errorBackground");
}

export function setStatusBarWarningBackground(status: StatusBarItem) {
  status.backgroundColor = new ThemeColor("statusBarItem.warningBackground");
}

export function setStatusBarBackground(
  status: StatusBarItem,
  backgroud: "error" | "warning" | undefined,
) {
  switch (backgroud) {
    case "error":
      setStatusBarErrorBackground(status);
      break;
    case "warning":
      setStatusBarWarningBackground(status);
      break;
    case undefined:
      status.backgroundColor = undefined;
  }
}
