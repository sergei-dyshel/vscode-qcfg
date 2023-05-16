/* eslint-disable unicorn/prefer-module */
import { parseSyntaxTimed } from './parsing';

export class SyntaxLanguage {
  async parse(text: string) {
    return parseSyntaxTimed(text, this.config.parser);
  }

  static get(languageId: string) {
    if (!SyntaxLanguage.isSupported(languageId))
      throw new Error(`Language ${languageId} syntax parsing unsupported`);

    if (languages.has(languageId)) return languages.get(languageId)!;
    const language = new SyntaxLanguage(configs[languageId]!);
    languages.set(languageId, language);
    return language;
  }

  static isSupported(languageId: string) {
    return languageId in configs;
  }

  static allSupported() {
    return Object.keys(configs);
  }

  private constructor(private readonly config: SyntaxConfig) {}
}

// Private

const languages = new Map<string, SyntaxLanguage>();

interface SyntaxConfig {
  parser: unknown;
}

const configs: Record<string, SyntaxConfig | undefined> = {
  python: { parser: require('tree-sitter-python') },
  c: { parser: require('tree-sitter-c') },
  cpp: { parser: require('tree-sitter-cpp') },
  javascript: { parser: require('tree-sitter-javascript') },
  json: { parser: require('tree-sitter-json') },
  typescript: { parser: require('tree-sitter-typescript/typescript') },
  shellscript: { parser: require('tree-sitter-bash') },
  go: { parser: require('tree-sitter-go') },
  lua: { parser: require('tree-sitter-lua') },
};
