'use strict';

import * as vscode from 'vscode';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import type { Language, PackageJson } from '../../library/packageJson';
import { parseJsonFileSync } from './json';
import { Modules } from './module';
import { readFirstLine } from './fileUtils';
import { fileMatch } from '../../library/glob';

export const colorThemeFiles: Record<string, string | undefined> = {};

export function getLanguageConfig(
  id: string,
): vscode.LanguageConfiguration | undefined {
  return langConfigs[id];
}

export function getLanguage(id: string): Language | undefined {
  return languages[id];
}

export function availableLanguageConfigs(): string[] {
  return Object.keys(langConfigs);
}

export function availableLanguages(): string[] {
  return Object.keys(languages);
}

export async function detectLanguage(
  filename: string,
): Promise<string | undefined> {
  const firstLine = await readFirstLine(filename);
  const ext = nodejs.path.extname(filename);
  const base = nodejs.path.basename(filename);
  for (const langId of availableLanguages()) {
    const lang = languages[langId]!;
    if (lang.extensions.includes(ext)) return langId;
    if (lang.filenames.includes(base)) return langId;
    for (const pattern of lang.filenamePatterns)
      if (fileMatch(filename, pattern)) return langId;
    // eslint-disable-next-line @typescript-eslint/prefer-regexp-exec
    if (lang.firstLine && firstLine.match(lang.firstLine)) return langId;
  }
  return undefined;
}

/**
 * Like Language but with less optional fields
 */
export interface NormalizedLanguage extends Language {
  id: string;
  extensions: string[];
  filenames: string[];
  filenamePatterns: string[];
  firstLine?: string;
  configuration?: string;
}

function normalizeLanguage(lang: Language): asserts lang is NormalizedLanguage {
  lang.extensions = lang.extensions ?? [];
  lang.filenames = lang.filenames ?? [];
  lang.filenamePatterns = lang.filenamePatterns ?? [];
}

function mergeLanguage(lang: NormalizedLanguage, other: NormalizedLanguage) {
  lang.extensions.push(...other.extensions);
  lang.filenames.push(...other.filenames);
  lang.filenamePatterns.push(...other.filenamePatterns);
  if (lang.firstLine && other.firstLine)
    log.warn(`firstLine collision for '${lang.id}'`);
  else lang.firstLine = other.firstLine;
  if (lang.configuration && other.configuration)
    log.warn(`configuration collision for '${lang.id}'`);
  else lang.configuration = other.configuration;
}

function fetchLangConfigs() {
  for (const ext of vscode.extensions.all) {
    const json = ext.packageJSON as PackageJson;
    // All vscode default extensions ids starts with "vscode."
    if (!json.contributes) continue;
    for (const themeData of json.contributes.themes ?? []) {
      const label = themeData.label!;
      const fullPath = nodejs.path.join(ext.extensionPath, themeData.path);
      if (!nodejs.fs.existsSync(fullPath)) continue;
      colorThemeFiles[label] = fullPath;
    }
    for (const langData of json.contributes.languages ?? []) {
      normalizeLanguage(langData);
      const langId: string = langData.id;
      if (langId in languages) {
        mergeLanguage(languages[langId]!, langData);
        // TODO: go over languages in separate pass and fetch configs
        continue;
      } else {
        languages[langId] = langData;
      }
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
  if (langConfigs['python']?.comments) {
    langConfigs['python'].comments.blockComment = undefined;
  }

  log.info('Got language configs for', Object.keys(langConfigs));
  log.info('Found color theme files for', Object.keys(colorThemeFiles));
}

/* TODO: move extension parsing to separate file */
const langConfigs: Record<string, vscode.LanguageConfiguration | undefined> =
  {};

const languages: Record<string, NormalizedLanguage | undefined> = {};

function activate(_: vscode.ExtensionContext) {
  fetchLangConfigs();
}

Modules.register(activate);
