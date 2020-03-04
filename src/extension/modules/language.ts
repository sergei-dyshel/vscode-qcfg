'use strict';

import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';

import * as vscode from 'vscode';
import { Modules } from './module';
import { parseJsonFileSync } from './json';
import { PackageJson } from '../../library/packageJson';

export const colorThemeFiles: { [id: string]: string | undefined } = {};

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
    const json = ext.packageJSON as PackageJson;
    // All vscode default extensions ids starts with "vscode."
    if (!json.contributes) continue;
    for (const themeData of json.contributes.themes ?? []) {
      const label = themeData.label as string;
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
      const langConfig = parseJsonFileSync(
        langFilePath,
      ) as vscode.LanguageConfiguration;
      langConfigs[langId] = langConfig;
    }
  }

  // for some reason """ is configured is block comment
  if (langConfigs.python && langConfigs.python.comments) {
    langConfigs.python.comments.blockComment = undefined;
  }

  log.info('Got language configs for', Object.keys(langConfigs));
  log.info('Found color theme files for', Object.keys(colorThemeFiles));
}

/* TODO: move extension parsing to separate file */
const langConfigs: {
  [id: string]: vscode.LanguageConfiguration | undefined;
} = {};

function activate(_: vscode.ExtensionContext) {
  fetchLangConfigs();
}

Modules.register(activate);
