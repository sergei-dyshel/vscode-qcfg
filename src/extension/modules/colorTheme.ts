import type { ExtensionContext } from "vscode";
import { commands, ConfigurationTarget, Uri, window, workspace } from "vscode";
import { assert } from "../../library/exception";
import { log } from "../../library/logging";
import { StringQuickPick } from "../utils/quickPick";
import {
  handleAsyncStd,
  listenAsyncWrapped,
  registerAsyncCommandWrapped,
} from "./exception";
import { colorThemeFiles } from "./language";
import { Modules } from "./module";

const SECTION = "workbench.colorTheme";
const MEMENTO_PERSIST_KEY = "qcfg.colors.persistent";
const MEMENTO_THEME_KEY = "qcfg.colors.theme";
const INVALID = "invalid_theme";

let extContext: ExtensionContext;

function isPersisted() {
  return extContext.workspaceState.get(MEMENTO_PERSIST_KEY, false);
}

async function setPersisted(value: boolean) {
  await extContext.workspaceState.update(MEMENTO_PERSIST_KEY, value);
}

function getPersistedTheme() {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return extContext.workspaceState.get(MEMENTO_THEME_KEY) as string;
}

async function setPersistedTheme(theme: string | undefined) {
  await extContext.workspaceState.update(MEMENTO_THEME_KEY, theme);
}

function getSettingsTheme(): string | undefined {
  const conf = workspace.getConfiguration();
  const val = conf.inspect(SECTION);
  if (!val) return undefined;
  if (val.workspaceValue) return val.workspaceValue as string;
  return undefined;
}

async function setSettingsTheme(theme: string | undefined) {
  const conf = workspace.getConfiguration();
  await conf.update(SECTION, theme, ConfigurationTarget.Workspace);
}

async function selectWorkspaceTheme() {
  await setPersisted(false);
  await window.showWarningMessage(
    "Clearing workspace theme, persist explicitly again after you choose",
  );
  await setSettingsTheme(INVALID);
  assert(
    getSettingsTheme() === INVALID,
    "Changed config file was not refreshed - symlinked workspace file?",
  );
  await commands.executeCommand("workbench.action.selectTheme");
}

async function persistWorkspaceTheme() {
  if (isPersisted()) {
    await window.showWarningMessage("Already persisted");
  }
  const settingsTheme = getSettingsTheme();
  assert(
    settingsTheme !== INVALID && settingsTheme !== undefined,
    "Workspace theme is not set",
  );
  await setPersisted(true);
  await setPersistedTheme(settingsTheme);
}

async function clearWorkspaceTheme() {
  await setSettingsTheme(undefined);
  await setPersisted(false);
  await setPersistedTheme(undefined);
}

async function onConfigurationChanged() {
  if (!isPersisted()) return;
  const settingsTheme = getSettingsTheme();
  const persistedTheme = getPersistedTheme();
  if (persistedTheme === settingsTheme) return;
  log.warn(
    `Workspace theme changed to "${settingsTheme}", reverting to persisted "${persistedTheme}"`,
  );
  await setSettingsTheme(persistedTheme);
}

async function inspectTheme() {
  const qp = new StringQuickPick(Object.keys(colorThemeFiles));
  qp.options.title = "Select theme";
  const theme = await qp.select();
  if (theme) {
    await window.showTextDocument(Uri.file(colorThemeFiles[theme]!));
  }
}

function activate(context: ExtensionContext) {
  extContext = context;
  handleAsyncStd(onConfigurationChanged());
  context.subscriptions.push(
    listenAsyncWrapped(
      workspace.onDidChangeConfiguration,
      onConfigurationChanged,
    ),
    registerAsyncCommandWrapped("qcfg.colors.select", selectWorkspaceTheme),
    registerAsyncCommandWrapped("qcfg.colors.persist", persistWorkspaceTheme),
    registerAsyncCommandWrapped("qcfg.colors.clear", clearWorkspaceTheme),
    registerAsyncCommandWrapped("qcfg.colors.inspect", inspectTheme),
  );
}

Modules.register(activate);
