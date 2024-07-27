import type { WorkspaceFolder } from "vscode";
import * as nodejs from "../../library/nodejs";
import { extensionContext } from "./extensionContext";

function getUserDir() {
  // taken from https://github.com/shanalikhan/code-settings-sync/blob/master/src/environmentPath.ts
  return nodejs.path.resolve(
    extensionContext().globalStorageUri.fsPath,
    "..",
    "..",
    "..",
    "User",
  );
}

export function getGlobalSettingsPath() {
  return nodejs.path.resolve(getUserDir(), SETTINGS_JSON);
}

export function getFolderSettingsPath(folder: WorkspaceFolder) {
  return nodejs.path.resolve(folder.uri.fsPath, ".vscode", SETTINGS_JSON);
}

const SETTINGS_JSON = "settings.json";
