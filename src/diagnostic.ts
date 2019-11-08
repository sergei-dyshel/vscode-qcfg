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
  DiagnosticChangeEvent
} from 'vscode';
import { Modules } from './module';
import { listenWrapped } from './exception';
import { getCompletionPrefix } from './documentUtils';
import { abbrevMatch } from './stringUtils';

let completions: string[] = [];

class CompletionsFromDiagnosticsProvider implements CompletionItemProvider {
  provideCompletionItems(
    document: TextDocument,
    position: Position
  ): ProviderResult<CompletionItem[] | CompletionList> {
    const prefix = getCompletionPrefix(document, position);
    if (prefix === '') return [];
    const items: CompletionItem[] = [];
    for (const code of completions) {
      if (!abbrevMatch(code, prefix)) continue;
      items.push(new CompletionItem(code));
    }
    return items;
  }
}

function recalcCompletions() {
  const newCompletions: string[] = [];
  const uriDiags = languages.getDiagnostics();
  for (const [, diags] of uriDiags)
    for (const diag of diags) {
      if (typeof diag.code === 'string') newCompletions.push(diag.code);
    }
  completions = newCompletions;
}

function onDidChangeDiagnostics(_: DiagnosticChangeEvent) {
  recalcCompletions();
}

function activate(context: ExtensionContext) {
  recalcCompletions();
  context.subscriptions.push(
    languages.registerCompletionItemProvider(
      '**',
      new CompletionsFromDiagnosticsProvider()
    ),
    listenWrapped(languages.onDidChangeDiagnostics, onDidChangeDiagnostics)
  );
}

Modules.register(activate);
