import type { TextDocument } from "vscode";
import { Uri, workspace } from "vscode";
import { Config } from "../../library/config";
import { fileMatch } from "../../library/glob";
import { mapNonNull } from "../../library/tsUtils";

import Cfg = Config.ConfigRules;

export class ConfigRules {
  constructor(documentOrUri: TextDocument | Uri) {
    this.rules = gatherRules(documentOrUri).filter((rule) =>
      ruleMatches(rule, documentOrUri),
    );
  }

  firstDefined<K extends keyof Cfg.RuleConfig>(
    key: K,
  ): Cfg.RuleConfig[K] | undefined {
    const defined = this.allDefined(key);
    if (defined.isEmpty) return undefined;
    return defined[0];
  }

  allDefined<K extends keyof Cfg.RuleConfig>(key: K): Array<Cfg.RuleConfig[K]> {
    return mapNonNull(this.rules, (rule) => {
      if (rule[key] !== undefined) return rule[key];
      return undefined;
    });
  }

  get all(): Cfg.RuleConfig[] {
    return this.rules;
  }

  private readonly rules: Cfg.Rule[] = [];
}

// Private

function gatherRules(documentOrUri: TextDocument | Uri) {
  const uri = documentOrUri instanceof Uri ? documentOrUri : documentOrUri.uri;
  const folder = workspace.getWorkspaceFolder(uri);
  const config = workspace.getConfiguration(undefined, folder);
  const allConfigs = config.inspect("qcfg.configRules");
  const rules: Cfg.Rule[] = [];

  for (const scope of [
    allConfigs?.workspaceFolderValue,
    allConfigs?.workspaceValue,
    allConfigs?.globalValue,
  ]) {
    if (!scope) continue;

    rules.push(...(scope as Cfg.Rule[]));
  }
  return rules;
}

function ruleMatches(cond: Cfg.Condition, documentOrUri: TextDocument | Uri) {
  const uri = documentOrUri instanceof Uri ? documentOrUri : documentOrUri.uri;
  const path = workspace.asRelativePath(
    uri,
    false /* includeWorkspaceFolder */,
  );

  if (cond.glob && !fileMatch(path, cond.glob)) return false;
  return !(
    cond.language &&
    !(documentOrUri instanceof Uri) &&
    cond.language !== documentOrUri.languageId
  );
}
