import type { SyntaxNode } from 'tree-sitter';
import { parseSyntax } from './parsing';
import type { SymbolRule } from './pattern';
import { findSymbols } from './pattern';
import { GoRules } from './rules/go';
import type { SyntaxSymbol } from './symbol';

export class SyntaxLanguage {
  async parse(text: string) {
    return parseSyntax(text, this.config.parser);
  }

  getSymbols(node: SyntaxNode) {
    const symbols: SyntaxSymbol[] = [];
    findSymbols(node, this.config.rules, symbols);
    return symbols;
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
  rules: SymbolRule[];
}

const configs: Record<string, SyntaxConfig | undefined> = {
  python: { parser: require('tree-sitter-python'), rules: [] },
  c: { parser: require('tree-sitter-c'), rules: [] },
  cpp: { parser: require('tree-sitter-cpp'), rules: [] },
  javascript: { parser: require('tree-sitter-javascript'), rules: [] },
  json: { parser: require('tree-sitter-json'), rules: [] },
  typescript: {
    parser: require('tree-sitter-typescript/typescript'),
    rules: [],
  },
  shellscript: { parser: require('tree-sitter-bash'), rules: [] },
  go: { parser: require('tree-sitter-go'), rules: GoRules },
  lua: { parser: require('tree-sitter-lua'), rules: [] },
};
