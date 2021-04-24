import type { TextDocument } from 'vscode';
import { workspace } from 'vscode';
import { fileMatch } from '../../library/glob';
import type { Condition, Rule, RuleConfig } from './configRules.model';

export class ConfigRules {
  constructor(document: TextDocument) {
    this.rules = gatherRules(document).filter((rule) =>
      ruleMatches(rule, document),
    );
  }

  firstDefined<K extends keyof RuleConfig>(key: K): RuleConfig[K] | undefined {
    for (const rule of this.rules) {
      if (rule[key] !== undefined) return rule[key];
    }
    return undefined;
  }

  get all(): RuleConfig[] {
    return this.rules;
  }

  private readonly rules: Rule[] = [];
}

// Private

function gatherRules(document: TextDocument) {
  const folder = workspace.getWorkspaceFolder(document.uri);
  const config = workspace.getConfiguration(undefined, folder);
  const allConfigs = config.inspect('qcfg.runOnSave');
  const rules: Rule[] = [];

  for (const scope of [
    allConfigs?.workspaceFolderValue,
    allConfigs?.workspaceValue,
    allConfigs?.globalValue,
  ]) {
    if (!scope) continue;

    rules.push(...(scope as Rule[]));
  }
  return rules;
}

function ruleMatches(cond: Condition, document: TextDocument) {
  const path = workspace.asRelativePath(
    document.uri,
    false /* includeWorkspaceFolder */,
  );

  if (cond.glob && !fileMatch(path, cond.glob)) return false;
  if (cond.language && cond.language !== document.languageId) return false;
  return true;
}
