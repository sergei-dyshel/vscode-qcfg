import { TextDocument, workspace, WorkspaceFolder } from 'vscode';
import * as minimatch from 'minimatch';

export interface RuleConfig {
  /** Transform document contents on save by running through pipe command */
  pipeOnSave?: {
    /** Command label, to be shown in statusbar, logs, messages etc. */
    label: string;
    /** Shell command to run */
    command: string;
  };
}

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

interface Rule extends Condition, RuleConfig {}

/* Exported type to generation extension configuration schema from it */
/** Array of configuration rules per file type, filename etc. */
export type Rules = Rule[];

interface Condition {
  /** Glob pattern to match against file name. */
  glob?: string;
  /** Language ID of file */
  language?: string;
}

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

  if (cond.glob && !minimatch.default(path, cond.glob)) return false;
  if (cond.language && cond.language !== document.languageId) return false;
  return true;
}
