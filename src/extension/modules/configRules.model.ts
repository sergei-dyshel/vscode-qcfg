export type QuickFixCodeActionsConfig = Array<string | [string, number]>;

export interface RuleConfig {
  quickFixCodeActions?: QuickFixCodeActionsConfig;
}

export interface Rule extends Condition, RuleConfig {}

/* Exported type to generation extension configuration schema from it */
/** Array of configuration rules per file type, filename etc. */
export type Rules = Rule[];

export interface Condition {
  /** Glob pattern to match against file name. */
  glob?: string;
  /** Language ID of file */
  language?: string;
}
