import * as vscode from 'vscode';
import type { ExtensionJSON } from '../../library/extensionManifest';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { parseJsonFileSync } from './json';
import { Modules } from './module';

export const colorThemeFiles: Record<string, string | undefined> = {};

export function getLanguageConfig(
  id: string,
): vscode.LanguageConfiguration | undefined {
  return langConfigs[id];
}

export function availableLanguageConfigs(): string[] {
  return Object.keys(langConfigs);
}

function fetchLangConfigs() {
  for (const ext of vscode.extensions.all) {
    const json = ext.packageJSON as ExtensionJSON.Manifest;
    // All vscode default extensions ids starts with "vscode."
    if (!json.contributes) continue;
    for (const themeData of json.contributes.themes ?? []) {
      const label = themeData.label!;
      const fullPath = nodejs.path.join(ext.extensionPath, themeData.path);
      if (!nodejs.fs.existsSync(fullPath)) continue;
      colorThemeFiles[label] = fullPath;
    }
    for (const langData of json.contributes.languages ?? []) {
      const langId: string = langData.id;
      if (!langData.configuration) {
        continue;
      }
      const langFilePath = nodejs.path.join(
        ext.extensionPath,
        langData.configuration,
      );
      if (!nodejs.fs.existsSync(langFilePath)) continue;
      const langConfig = parseJsonFileSync(
        langFilePath,
      ) as vscode.LanguageConfiguration;
      langConfigs[langId] = langConfig;
    }
  }

  // for some reason """ is configured is block comment
  if (langConfigs['python']?.comments) {
    langConfigs['python'].comments.blockComment = undefined;
  }

  log.info('Got language configs for', Object.keys(langConfigs));
  log.info('Found color theme files for', Object.keys(colorThemeFiles));
}

/* TODO: move extension parsing to separate file */
const langConfigs: Record<string, vscode.LanguageConfiguration | undefined> =
  {};

function activate(_: vscode.ExtensionContext) {
  fetchLangConfigs();
}

Modules.register(activate);
