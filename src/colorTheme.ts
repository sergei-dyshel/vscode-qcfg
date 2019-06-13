'use strict';

import * as vscode from 'vscode';
import { log } from './logging';
import {workspace, commands} from 'vscode';
import { colorThemeFiles } from './language';
import { selectStringFromList } from './dialog';
import { registerCommandWrapped, listenWrapped } from './exception';

const SECTION = 'workbench.colorTheme';
const MEMENTO_PERSIST_KEY = 'qcfg.colors.persistent';
const MEMENTO_THEME_KEY = 'qcfg.colors.theme';
const INVALID = 'invalid_theme';

let extContext: vscode.ExtensionContext;

function isPersisted() {
  return extContext.workspaceState.get(MEMENTO_PERSIST_KEY, false);
}

async function setPersisted(value: boolean)
{
  await extContext.workspaceState.update(MEMENTO_PERSIST_KEY, value);
}

function getPersistedTheme() {
  return extContext.workspaceState.get(MEMENTO_THEME_KEY) as string;
}

async function setPersistedTheme(theme: string|undefined) {
  await extContext.workspaceState.update(MEMENTO_THEME_KEY, theme);
}

function getSettingsTheme(): string|undefined {
  const conf = workspace.getConfiguration();
  const val = conf.inspect(SECTION);
  if (!val)
    return;
  if (val.workspaceValue)
    return val.workspaceValue as string;
}

async function setSettingsTheme(theme: string | undefined)
{
  const conf = workspace.getConfiguration();
  await conf.update(SECTION, theme, vscode.ConfigurationTarget.Workspace);
}

async function selectWorkspaceTheme(_extContext: vscode.ExtensionContext)
{
  await setPersisted(false);
  vscode.window.showWarningMessage(
      'Clearing workspace theme, persist explicitly again after you choose');
  await setSettingsTheme(INVALID);
  log.assert(
      getSettingsTheme() === INVALID,
      'Changed config file was not refreshed - symlinked workspace file?');
  await commands.executeCommand('workbench.action.selectTheme');
}

async function persistWorkspaceTheme(_extContext: vscode.ExtensionContext)
{
  if (isPersisted())
    vscode.window.showWarningMessage('Already persisted');
  const settingsTheme = getSettingsTheme();
  log.assert(
      settingsTheme !== INVALID && settingsTheme !== undefined,
      'Workspace theme is not set');
  await setPersisted(true);
  await setPersistedTheme(settingsTheme);
}

async function clearWorkspaceTheme(_extContext: vscode.ExtensionContext)
{
  setSettingsTheme(undefined);
  setPersisted(false);
  setPersistedTheme(undefined);
}

async function onConfigurationChanged()
{
  if (!isPersisted())
    return;
  const settingsTheme = getSettingsTheme();
  const persistedTheme = getPersistedTheme();
  if (persistedTheme === settingsTheme)
    return;
  log.warn(`Workspace theme changed to "${
      settingsTheme}", reverting to persisted "${persistedTheme}"`);
  await setSettingsTheme(persistedTheme);
}

async function inspectTheme()
{
  const themes = Object.keys(colorThemeFiles);
  const theme = await selectStringFromList(themes);
  if (theme)
    vscode.window.showTextDocument(vscode.Uri.file(colorThemeFiles[theme]));
}

export function activate(context: vscode.ExtensionContext) {
  extContext = context;
  onConfigurationChanged();
  context.subscriptions.push(
      listenWrapped(workspace.onDidChangeConfiguration, onConfigurationChanged),
      registerCommandWrapped('qcfg.colors.select', selectWorkspaceTheme),
      registerCommandWrapped('qcfg.colors.persist', persistWorkspaceTheme),
      registerCommandWrapped('qcfg.colors.clear', clearWorkspaceTheme),
      registerCommandWrapped('qcfg.colors.inspect', inspectTheme));
}
