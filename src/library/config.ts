import { dedent } from "@sergei-dyshel/typescript/string";
import { zod } from "@sergei-dyshel/typescript/zod";

export namespace Config {
  export namespace Git {
    export const linkSchema = zod.object({
      title: zod.string().describe("Description of Web link"),
      url: zod.string().describe("Web url"),
    });

    export const entrySchema = zod.object({
      remotes: zod.array(zod.string()).describe("List of remote patterns"),
      links: zod.array(linkSchema).describe("Description of Web link"),
    });

    export type Link = zod.infer<typeof linkSchema>;
    export type Entry = zod.infer<typeof entrySchema>;
  }

  export namespace ConfigRules {
    export const quickFixCodeActionsConfigSchema = zod.array(
      zod.union([zod.string(), zod.tuple([zod.string(), zod.number()])]),
    );

    export const ruleConfigSchema = zod.object({
      quickFixCodeActions: quickFixCodeActionsConfigSchema.optional(),
    });

    export const conditionSchema = zod.object({
      glob: zod
        .string()
        .optional()
        .describe("Glob pattern to match against file name."),
      language: zod.string().optional().describe("Language ID of file"),
    });

    export const ruleSchema = conditionSchema.merge(ruleConfigSchema);

    export type Condition = zod.infer<typeof conditionSchema>;
    export type RuleConfig = zod.infer<typeof ruleConfigSchema>;
    export type Rule = zod.infer<typeof ruleSchema>;
  }

  export namespace Tasks {
    export enum Reveal {
      FOCUS = "focus",
      YES = "yes",
      NO = "no",
    }

    const revealSchema = zod.nativeEnum(Reveal);

    export enum EndAction {
      NONE = "none",
      AUTO = "auto",
      HIDE = "hide",
      DISPOSE = "dispose",
      SHOW = "show",
      NOTIFY = "notify",
    }

    const endActionSchema = zod.nativeEnum(EndAction);

    export enum Flag {
      DEDICATED_PANEL = "dedicatedPanel",
      CLEAR = "clear",
      AUTO_RESTART = "autoRestart",
      REINDEX = "reindex",

      /**
       * Build task.
       *
       * Build tasks are also always folder tasks.
       */
      BUILD = "build",

      /**
       * Multi-folder task.
       *
       * Running such task will run the task in all folders where it's
       * applicable.
       */
      MULTI = "multi",

      /** Notify on failure */
      NOTIFY_ON_FAILURE = "notifyOnFailure",

      /** Task is hidden when from pick list, i.e. can be run only directly */
      HIDDEN = "hidden",

      /** Task applies to any workspace folder (i.e. not current dir/file) */
      FOLDER = "folder",

      // Search specific flags
      REGEX = "regex",
      WORD = "word",
      CASE = "case",
    }

    const flagHiddenSchema = zod
      .literal(Flag.HIDDEN)
      .describe(
        "Task is hidden when from pick list, i.e. can be run only directly",
      );

    const flagBuildSchema = zod.literal(Flag.BUILD).describe(dedent`
        Build task.

        Build tasks are also always folder tasks.
      `);

    const flagFolderSchema = zod
      .literal(Flag.FOLDER)
      .describe(
        "Task applies to any workspace folder (i.e. not current dir/file)",
      );

    const flagNotifyOnFailureSchema = zod
      .literal(Flag.NOTIFY_ON_FAILURE)
      .describe("Notify on failure");
    const flagSchema = zod.union([
      zod.literal(Flag.DEDICATED_PANEL),
      zod.literal(Flag.CLEAR),
      zod.literal(Flag.AUTO_RESTART),
      zod.literal(Flag.REINDEX),
      flagBuildSchema,
      zod.literal(Flag.MULTI).describe(dedent`
        Multi-folder task.

        Running such task will run the task in all folders where it's
        applicable.
      `),
      flagNotifyOnFailureSchema,
      flagHiddenSchema,
      flagFolderSchema,
      zod.literal(Flag.REGEX),
      zod.literal(Flag.WORD),
      zod.literal(Flag.CASE),
    ]);

    export enum TaskType {
      PROCESS = "process",
      TERMINAL = "terminal",
      SEARCH = "search",
    }

    export const typeSchema = zod.nativeEnum(TaskType);

    const baseProcessTaskFlagSchema = zod.union([
      flagBuildSchema,
      flagFolderSchema,
      flagHiddenSchema,
    ]);

    const whenSchema = zod.object({
      fileExists: zod
        .string()
        .optional()
        .describe("File exists of given glob pattern"),
      fileMatches: zod
        .string()
        .optional()
        .describe("Current file matches glob pattern"),
      fileExistsInParent: zod
        .string()
        .optional()
        .describe(
          "File exists in current or parent directories and matches given glob pattern",
        ),
    });

    const baseTaskParamsSchema = zod.object({
      title: zod.string().optional(),
      type: typeSchema,
      when: whenSchema.optional(),
      flags: zod.array(flagSchema).optional(),
      folders: zod
        .array(zod.string())
        .default([])
        .optional()
        .describe("Workspace folders in which this task is valid"),
    });

    export type BaseTaskParams = zod.infer<typeof baseTaskParamsSchema>;

    const baseProcessTaskParamsSchema = baseTaskParamsSchema.extend({
      command: zod.string(),
      cwd: zod.string().optional(),
      exitCodes: zod
        .array(zod.number())
        .default([])
        .optional()
        .describe("Expected process exit codes"),
    });

    export type BaseProcessTaskParams = zod.infer<
      typeof baseProcessTaskParamsSchema
    >;

    // only to add auto-complete suggestions to schema
    const knownProblemMatcherSchema = zod.enum([
      "gcc-relative",
      "gcc-absolute",
    ]);

    const terminalTaskParamsSchema = baseProcessTaskParamsSchema.extend({
      type: zod.literal(TaskType.TERMINAL),
      reveal: revealSchema
        .default(Reveal.YES)
        .optional()
        .describe("Reveal terminal when running"),
      onSuccess: endActionSchema.default(EndAction.AUTO).optional(),
      onFailure: endActionSchema.default(EndAction.AUTO).optional(),
      problemMatchers: zod
        .union([
          zod.string(),
          knownProblemMatcherSchema,
          zod.array(zod.union([zod.string(), knownProblemMatcherSchema])),
        ])
        .default([])
        .optional(),
      flags: zod
        .array(
          zod.union([
            ...baseProcessTaskFlagSchema.options,
            zod.literal(Flag.CLEAR),
            zod.literal(Flag.DEDICATED_PANEL),
            zod.literal(Flag.REINDEX),
            zod.literal(Flag.AUTO_RESTART),
            flagNotifyOnFailureSchema,
          ]),
        )
        .optional(),
    });

    export type TerminalTaskParams = zod.infer<typeof terminalTaskParamsSchema>;

    export enum LocationFormat {
      VIMGREP = "vimgrep",
      GTAGS = "gtags",
    }

    const locationFormatSchema = zod.nativeEnum(LocationFormat);

    const ParseOutputSchema = zod.object({
      format: locationFormatSchema,
      tag: zod.string().optional(),
    });

    const processTaskParamsSchema = baseProcessTaskParamsSchema.extend({
      type: zod.literal(TaskType.PROCESS),
      parseOutput: ParseOutputSchema.optional().describe(
        "Extract locations from output using predefined format or custom regular expression",
      ),
      flags: zod.array(baseProcessTaskFlagSchema).optional(),
    });

    export type ProcessTaskParams = zod.infer<typeof processTaskParamsSchema>;

    const searchTaskParamsSchema = baseTaskParamsSchema.extend({
      type: zod.literal(TaskType.SEARCH),
      query: zod.string(),
      searchTitle: zod.string().optional(),
      flags: zod
        .array(
          zod.union([
            flagHiddenSchema,
            zod.literal(Flag.REGEX),
            zod.literal(Flag.WORD),
            zod.literal(Flag.CASE),
          ]),
        )
        .optional(),
    });

    export type SearchTaskParams = zod.infer<typeof searchTaskParamsSchema>;

    const paramsSchema = zod.union([
      terminalTaskParamsSchema,
      processTaskParamsSchema,
      searchTaskParamsSchema,
    ]);

    export type Params = zod.infer<typeof paramsSchema>;

    export const confParamsSetSchema = zod.record(
      zod.string(),
      zod.union([zod.string(), paramsSchema]),
    );

    export type ConfParamsSet = zod.infer<typeof confParamsSetSchema>;
  }

  export const allSchema = zod.object({
    "qcfg.autoResize.steps": zod
      .number()
      .default(1)
      .describe("Number of steps by which to auto-resize active editor"),
    "qcfg.autoResize.enabled": zod
      .boolean()
      .default(false)
      .describe("Whether auto-resize enabled"),
    "qcfg.alternate.mapping": zod
      .record(zod.string(), zod.array(zod.string()))
      .default({})
      .describe("Mapping for alternate (header/source) switch."),
    "qcfg.autoSync.enabled": zod
      .boolean()
      .default(false)
      .describe("AutoSync enabled on start"),
    "qcfg.autoSync.command": zod.string().describe("AutoSync command."),
    "qcfg.autoMarkdownPreview": zod
      .boolean()
      .describe("Open preview automatically when opening markdown documents."),
    "qcfg.newNote.folder": zod
      .string()
      .describe("Workspace folder name for creating new notes."),
    "qcfg.newNote.path": zod
      .string()
      .describe("Path of notes directory relative to workspace folder root"),
    "qcfg.git.web": zod
      .array(Git.entrySchema)
      .default([])
      .describe("List of rules to open current line in Git Web UI."),
    "qcfg.remote.setDefault": zod
      .boolean()
      .default(false)
      .describe(
        "Per-workspace/folder setting to set it as default remote server",
      ),
    "qcfg.gtags.workspaceSymbols": zod
      .boolean()
      .default(false)
      .describe("Use gtags as workspace symbols provider"),
    "qcfg.gtags.hover": zod
      .boolean()
      .default(false)
      .describe("Use gtags hover symbol provider"),
    "qcfg.notification.timeoutMs": zod
      .number()
      .default(3000)
      .describe("Default timeout (in milliseconds) for notifications"),
    "qcfg.configDir.global": zod
      .string()
      .default("~")
      .describe(
        "Global configuration directory for vscode-qcfg specific features (defaults to HOME directory)",
      ),
    "qcfg.configDir.workspace": zod
      .string()
      .default(".")
      .describe(
        "Workspace configuration direcotry for vsdode-qcfg specific features,relative to workspace file's directory or the only folder by default",
      ),
    "qcfg.fileDiagnostics.show": zod
      .boolean()
      .default(true)
      .describe("Whether do show per-file diagnostic counts in statusbar"),
    "qcfg.fileDiagnostics.excludeMessage": zod
      .string()
      .describe("Exclude diagnostics whose message matches this pattern"),
    "qcfg.fileDiagnostics.excludeSource": zod
      .string()
      .describe("Exclude diagnostics whose source matches this pattern"),
    "qcfg.fileDiagnostics.excludeCodes": zod
      .array(zod.union([zod.number(), zod.string()]))
      .describe("Exclude diagnostics whose code matches any of these"),
    "qcfg.langClient.remote": zod
      .boolean()
      .default(false)
      .describe("C/C++ language clients are remote (over SSH)"),
    "qcfg.clangd.restartCommand": zod
      .array(zod.string())
      .describe("Custom command for restarting clangd (e.g. kill server)"),
    "qcfg.clangd.typeHierarchy": zod
      .boolean()
      .default(true)
      .describe("Add clangd provider for type hierarchy"),
    "qcfg.clangd.clearCacheCommand": zod
      .array(zod.string())
      .describe("Command to clear clangd cache"),
    "qcfg.ccls.clearCacheCommand": zod
      .array(zod.string())
      .describe("Command to clear ccls cache"),
    "qcfg.ccls.typeHierarchy": zod
      .boolean()
      .default(true)
      .describe("Add ccls provider for type hierarchy"),
    "qcfg.ccls.callHierarchy": zod
      .boolean()
      .default(true)
      .describe("Add ccls provider for call hierarchy"),
    "qcfg.configRules": zod
      .array(ConfigRules.ruleSchema)
      .default([])
      .describe("Array of configuration rules per file type, name etc."),
    "qcfg.tasks": Tasks.confParamsSetSchema
      .default({})
      .describe("Dictionary of tasks"),
    "qcfg.todo.keywords": zod
      .array(zod.string())
      .default([])
      .describe("List of TODO keywords"),
    "qcfg.just.command": zod
      .union([zod.string(), zod.array(zod.string())])
      .default("just")
      .describe(
        "Command to run just.\n\nCan be either excutable or array of executable and arguments.",
      ),
  });

  export type All = zod.infer<typeof allSchema>;
}
