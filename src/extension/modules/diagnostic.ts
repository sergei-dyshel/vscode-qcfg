'use strict';

import {
  ExtensionContext,
  CompletionItemProvider,
  TextDocument,
  Position,
  ProviderResult,
  CompletionItem,
  CompletionList,
  languages,
  DiagnosticChangeEvent,
  Range,
} from 'vscode';
import { Modules } from './module';
import { listenWrapped } from './exception';
import { getCompletionPrefix } from './documentUtils';
import { abbrevMatch } from '../../library/stringUtils';
import { offsetPosition } from './textUtils';

const eslintRules = new Set<string>();

const CompletionsFromDiagnosticsProvider: CompletionItemProvider = {
  provideCompletionItems(
    document: TextDocument,
    position: Position,
  ): ProviderResult<CompletionItem[] | CompletionList> {
    const prefix = getCompletionPrefix(document, position, /([\w@/-]*)$/);
    if (prefix === '') return [];
    const items: CompletionItem[] = [];
    for (const code of eslintRules) {
      if (!abbrevMatch(code, prefix) && !code.startsWith(prefix)) continue;
      const item = new CompletionItem(code);
      item.range = new Range(
        offsetPosition(document, position, -prefix.length),
        position,
      );
      items.push(item);
    }
    return items;
  },
};

function recalcCompletions() {
  eslintRules.clear();
  const uriDiags = languages.getDiagnostics();
  for (const [, diags] of uriDiags)
    for (const diag of diags) {
      if (diag.source === 'eslint' && typeof diag.code === 'string')
        eslintRules.add(diag.code);
    }
  for (const word of ['off', 'error']) eslintRules.add(word);
}

function onDidChangeDiagnostics(_: DiagnosticChangeEvent) {
  recalcCompletions();
}

function activate(context: ExtensionContext) {
  recalcCompletions();
  context.subscriptions.push(
    languages.registerCompletionItemProvider(
      { pattern: '**/.eslintrc.*' },
      CompletionsFromDiagnosticsProvider,
      ...'\'"-/@abcdefghijklmnopqrstuvwxyz'.split(''),
    ),
    listenWrapped(languages.onDidChangeDiagnostics, onDidChangeDiagnostics),
  );
}

Modules.register(activate);
