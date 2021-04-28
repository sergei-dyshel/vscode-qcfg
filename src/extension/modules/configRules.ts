import { TextDocument, Uri } from 'vscode';
import { workspace } from 'vscode';
import { fileMatch } from '../../library/glob';
import { mapNonNull } from '../../library/tsUtils';
import type { Condition, Rule, RuleConfig } from './configRules.model';

export class ConfigRules {
  constructor(documentOrUri: TextDocument | Uri) {
    this.rules = gatherRules(documentOrUri).filter((rule) =>
      ruleMatches(rule, documentOrUri),
    );
  }

  firstDefined<K extends keyof RuleConfig>(key: K): RuleConfig[K] | undefined {
    const defined = this.allDefined(key);
    if (defined.isEmpty) return undefined;
    return defined[0];
  }

  allDefined<K extends keyof RuleConfig>(key: K): Array<RuleConfig[K]> {
    return mapNonNull(this.rules, (rule) => {
      if (rule[key] !== undefined) return rule[key];
      return undefined;
    });
  }

  get all(): RuleConfig[] {
    return this.rules;
  }

  private readonly rules: Rule[] = [];
}

// Private

function gatherRules(documentOrUri: TextDocument | Uri) {
  const uri = documentOrUri instanceof Uri ? documentOrUri : documentOrUri.uri;
  const folder = workspace.getWorkspaceFolder(uri);
  const config = workspace.getConfiguration(undefined, folder);
  const allConfigs = config.inspect('qcfg.configRules');
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

function ruleMatches(cond: Condition, documentOrUri: TextDocument | Uri) {
  const uri = documentOrUri instanceof Uri ? documentOrUri : documentOrUri.uri;
  const path = workspace.asRelativePath(
    uri,
    false /* includeWorkspaceFolder */,
  );

  if (cond.glob && !fileMatch(path, cond.glob)) return false;
  if (
    cond.language &&
    !(documentOrUri instanceof Uri) &&
    cond.language !== documentOrUri.languageId
  )
    return false;
  return true;
}
