import type {
  FindTextInFilesOptions,
  Location,
  TaskDefinition,
  TextSearchQuery,
  WorkspaceFolder,
} from "vscode";
import {
  commands,
  ShellExecution,
  Task,
  TaskGroup,
  TaskPanelKind,
  TaskRevealKind,
  TaskScope,
  Uri,
  window,
  workspace,
} from "vscode";
import { Config } from "../../library/config";
import { log, LogLevel } from "../../library/logging";
import * as nodejs from "../../library/nodejs";
import { baseName, dirName, stripExt } from "../../library/pathUtils";
import {
  expandTemplateLiteral,
  TemplateLiteralError,
} from "../../library/stringUtils";
import { concatArrays } from "../../library/tsUtils";
import { getDocumentWorkspaceFolder } from "../utils/document";
import { getFolderSettingsPath, getGlobalSettingsPath } from "../utils/paths";
import type { BaseQuickPickItem } from "../utils/quickPick";
import { QuickPickButtons } from "../utils/quickPick";
import { isMultiFolderWorkspace } from "../utils/workspace";
import { mapAsync, mapAsyncSequential } from "./async";
import { executeCommandHandled } from "./exception";
import { peekLocations } from "./fileUtils";
import { editJsonPath } from "./json";
import { showOsNotification } from "./osNotification";
import {
  findPatternInParsedLocations,
  ParseLocationFormat,
  parseLocations,
} from "./parseLocations";
import * as remoteControl from "./remoteControl";
import { saveAndPeekSearch } from "./savedSearch";
import { searchInFiles } from "./search";
import { ExecResult, Subprocess } from "./subprocess";
import { TaskCancelledError, TaskConfilictPolicy, TaskRun } from "./taskRunner";
import { currentWorkspaceFolder, getCursorWordContext } from "./utils";

import Cfg = Config.Tasks;

/** Source of task definition (workspace, folder etc.) */
export interface ParamsSource {
  workspace?: boolean;
  folder?: WorkspaceFolder;
}

export interface FetchInfo {
  /** Task label as defined in params or when calling programmatically */
  label: string;

  /** Origin of task (whether its from workspace or not, which folder etc.) */
  source: ParamsSource;
}

export function isFolderTask(params: Cfg.BaseTaskParams) {
  return (
    params.type === Cfg.TaskType.SEARCH ||
    params.folders !== undefined ||
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    params.flags?.includes(Cfg.Flag.BUILD) ||
    params.flags?.includes(Cfg.Flag.FOLDER)
  );
}

/**
 * Context of running task, considering specific workspace folder, current file,
 * line, selected text etc.
 */
export class TaskContext {
  constructor(folder?: WorkspaceFolder) {
    const editor = window.activeTextEditor;
    const curWorkspaceFolder = currentWorkspaceFolder();
    this.workspaceFolder = folder ?? curWorkspaceFolder;
    if (editor) {
      const document = editor.document;
      this.fileName = document.fileName;
      this.vars["file"] = this.fileName;
      if (!editor.selection.isEmpty)
        this.vars["selectedText"] = document.getText(editor.selection);
      if (editor.selection.isEmpty)
        this.vars["lineNumber"] = String(editor.selection.active.line + 1);
      if (editor.selection.isEmpty) {
        const wordCtx = getCursorWordContext();
        if (wordCtx) {
          this.vars["cursorWord"] = wordCtx.word;
        }
      } else {
        this.vars["cursorWord"] = document.getText(editor.selection);
      }
      this.vars["stripExt"] = stripExt;
      this.vars["baseName"] = baseName;
      this.vars["dirName"] = dirName;
      if (this.workspaceFolder) {
        this.vars["workspaceFolder"] = this.workspaceFolder.uri.fsPath;
        this.vars["relativeFile"] = nodejs.path.relative(
          this.vars["workspaceFolder"],
          document.fileName,
        );
      }
      if (curWorkspaceFolder) {
        this.vars["curWorkspaceFolder"] = curWorkspaceFolder.uri.fsPath;
      }
    }
    if (workspace.workspaceFolders)
      this.vars["allWorkspaceFolders"] = workspace.workspaceFolders
        .map((wf) => wf.uri.fsPath)
        .join(" ");
  }

  substitute(text: string): string {
    try {
      return expandTemplateLiteral(text, this.vars);
    } catch (err) {
      if (err instanceof TemplateLiteralError)
        throw new ValidationError(`Could not expand template: ${err.message}`);
      throw err;
    }
  }

  readonly workspaceFolder?: WorkspaceFolder;
  readonly fileName?: string;
  // eslint-disable-next-line @typescript-eslint/ban-types
  readonly vars: Record<string, string | Function> = {};
}

/**
 * Task definition (params) has mistakes.
 */
export class ParamsError extends Error {}

/**
 * Task is invalid for given context and won't be presented in list
 */
export class ValidationError extends Error {}

/**
 * Could not substitue variable
 */
export class TaskVarSubstituteError extends ValidationError {
  constructor(public varname: string) {
    super(`Could not substitute variable "${varname}"`);
  }
}

export class ConditionError extends ValidationError {
  constructor(message: string) {
    super("Condition check failed: " + message);
  }
}

export abstract class BaseTask {
  /** One or multiple folders to run task in */
  folderText?: string;

  abstract run(): Promise<void>;
  abstract isBuild(): boolean;

  protected abstract isFromWorkspace(): boolean;
  protected abstract isBackground(): boolean;
  protected abstract fullName(): string;
  /** For quick pick list */
  protected abstract title(): string;

  protected prefixTags(): string {
    let res = "";
    res += this.isFromWorkspace() ? "$(home)" : "     ";
    res += "      ";
    return res;
  }

  protected suffixTags(): string[] {
    const tags: string[] = [];
    if (this.isBuild()) tags.push("$(tools)");
    if (this.isBackground()) tags.push("$(clock)");
    return tags;
  }

  toQuickPickItem() {
    const item: BaseQuickPickItem = {
      label: this.prefixTags() + this.title(),
    };
    if (this.folderText) {
      item.description = this.folderText;
    }
    const tags = this.suffixTags();
    if (!tags.isEmpty) item.label += "      " + tags.join("  ");
    return item;
  }

  toPersistentLabel() {
    return this.fullName() + (this.folderText ? " " + this.folderText : "");
  }
}

export class VscodeTask extends BaseTask {
  constructor(protected task: Task) {
    super();
    if (
      task.scope &&
      task.scope !== TaskScope.Global &&
      task.scope !== TaskScope.Workspace &&
      isMultiFolderWorkspace()
    ) {
      this.folderText = task.scope.name;
    }
  }

  async run() {
    this.taskRun = new TaskRun(this.task);
    await this.taskRun.start();
    await this.taskRun.wait();
  }

  isBuild() {
    return this.task.group === TaskGroup.Build;
  }

  protected override isFromWorkspace() {
    return this.task.source === "Workspace";
  }

  protected isBackground() {
    return this.task.isBackground;
  }

  protected override fullName() {
    const task = this.task;
    let fullName = task.name;
    if (task.source && task.source !== "Workspace")
      fullName = `${task.source}: ${fullName}`;
    return fullName;
  }

  title() {
    return this.fullName();
  }

  protected taskRun?: TaskRun;
}

export abstract class BaseQcfgTask extends BaseTask {
  constructor(
    protected readonly params:
      | Cfg.TerminalTaskParams
      | Cfg.ProcessTaskParams
      | Cfg.SearchTaskParams,
    protected readonly info: FetchInfo,
  ) {
    super();
  }

  get label() {
    return this.info.label;
  }

  protected override isFromWorkspace() {
    return (
      this.info.source.workspace === true ||
      this.info.source.folder !== undefined
    );
  }

  // eslint-disable-next-line class-methods-use-this
  protected isBackground() {
    return false;
  }

  protected fullName() {
    return "qcfg: " + this.info.label;
  }

  protected title() {
    return "qcfg: " + (this.params.title ?? this.info.label);
  }

  isBuild() {
    if (this.params.type === Cfg.TaskType.SEARCH) return false;
    return (this.params.flags ?? []).includes(Cfg.Flag.BUILD);
  }

  override toQuickPickItem() {
    const item = super.toQuickPickItem();
    item.itemButtons = new Map([
      [QuickPickButtons.EDIT, () => this.editParams()],
    ]);
    return item;
  }

  /** Go to */
  private editParams(): Promise<void> | void {
    let settings: string;
    const source = this.info.source;
    if (source.folder) settings = getFolderSettingsPath(source.folder);
    else if (source.workspace) settings = workspace.workspaceFile!.fsPath;
    else settings = getGlobalSettingsPath();

    const jsonPath = ["qcfg.tasks", this.info.label];
    if (source.workspace) {
      jsonPath.unshift("settings");
    }
    return editJsonPath(Uri.file(settings), jsonPath);
  }
}

export class TerminalTask extends BaseQcfgTask {
  private readonly task: Task;
  protected taskRun?: TaskRun;

  constructor(
    protected override params: Cfg.TerminalTaskParams,
    info: FetchInfo,
    context: TaskContext,
  ) {
    super(params, info);
    if (isFolderTask(params) && isMultiFolderWorkspace()) {
      this.folderText = context.workspaceFolder!.name;
    }
    this.params = params;
    const def: TaskDefinition = { type: "qcfg", task: params };
    const flags: Cfg.Flag[] = params.flags ?? [];

    const scope = context.workspaceFolder ?? TaskScope.Global;
    const environ = { QCFG_VSCODE_PORT: String(remoteControl.port) };
    const shellExec = new ShellExecution(context.substitute(params.command), {
      cwd: params.cwd,
      env: environ,
    });
    this.task = new Task(
      def,
      scope,
      info.label,
      "qcfg",
      shellExec,
      params.problemMatchers ?? [],
    );
    this.task.presentationOptions = {
      focus: params.reveal === Cfg.Reveal.FOCUS,
      reveal:
        params.reveal === Cfg.Reveal.NO
          ? TaskRevealKind.Never
          : TaskRevealKind.Always,
      panel: flags.includes(Cfg.Flag.DEDICATED_PANEL)
        ? TaskPanelKind.Dedicated
        : TaskPanelKind.Shared,
      clear: flags.includes(Cfg.Flag.CLEAR) || flags.includes(Cfg.Flag.BUILD),
    };
    if (flags.includes(Cfg.Flag.BUILD)) this.task.group = TaskGroup.Build;
  }

  async run() {
    this.taskRun = new TaskRun(this.task);
    const conflictPolicy = this.params.flags?.includes(Cfg.Flag.AUTO_RESTART)
      ? TaskConfilictPolicy.CANCEL_PREVIOUS
      : undefined;
    await this.taskRun.start(conflictPolicy);
    try {
      await this.taskRun.wait();
    } catch (err: unknown) {
      if (err instanceof TaskCancelledError) return;
      throw err;
    }

    const params = this.params;
    const exitCodes = params.exitCodes ?? [0];
    const success = exitCodes.includes(this.taskRun.exitCode!);
    const term = this.taskRun.terminal;
    if (success && params.flags && params.flags.includes(Cfg.Flag.REINDEX)) {
      // avoid circular dependency
      executeCommandHandled("qcfg.langClient.refresh");
    }
    if (
      !success &&
      params.flags &&
      params.flags.includes(Cfg.Flag.NOTIFY_ON_FAILURE)
    ) {
      showOsNotification(
        `Task "${this.task.name}" failed with code ${this.taskRun.exitCode}`,
        {
          timeoutSec: 0,
          unfocusedOnly: true,
        },
      );
    }
    let action = success ? params.onSuccess : params.onFailure;
    if (action === Cfg.EndAction.AUTO || action === undefined) {
      if (success) {
        action = Cfg.EndAction.HIDE;
      } else {
        action =
          params.reveal === Cfg.Reveal.NO
            ? Cfg.EndAction.NOTIFY
            : Cfg.EndAction.SHOW;
      }
    }
    if (!term) return;

    switch (action) {
      case Cfg.EndAction.NONE:
        break;
      case Cfg.EndAction.DISPOSE:
        if (window.activeTerminal === term) {
          term.dispose();
          await commands.executeCommand("workbench.action.closePanel");
        } else {
          term.dispose();
        }
        break;
      case Cfg.EndAction.HIDE:
        term.hide();
        break;
      case Cfg.EndAction.SHOW:
        term.show();
        break;
      case Cfg.EndAction.NOTIFY:
        await (success
          ? window.showInformationMessage(`Task "${this.task.name}" finished`)
          : window.showErrorMessage(`Task "${this.task.name}" failed`));
        break;
    }
  }
}

export class TerminalMultiTask extends BaseQcfgTask {
  private readonly folderTasks: TerminalTask[];
  constructor(
    params: Cfg.TerminalTaskParams,
    info: FetchInfo,
    folderContexts: TaskContext[],
  ) {
    super(params, info);
    this.folderTasks = folderContexts.map(
      (context) => new TerminalTask(params, info, context),
    );
    this.folderText = folderContexts
      .map((context) => context.workspaceFolder!.name)
      .join(", ");
  }

  async run() {
    return mapAsyncSequential(this.folderTasks, async (task) =>
      task.run(),
    ).ignoreResult();
  }
}

export class ProcessTask extends BaseQcfgTask {
  private readonly command: string;
  private readonly cwd: string;
  private readonly parseFormat?: ParseLocationFormat;
  private readonly parseTag?: RegExp;

  constructor(
    protected override params: Cfg.ProcessTaskParams,
    info: FetchInfo,
    context: TaskContext,
  ) {
    super(params, info);
    if (params.flags?.includes(Cfg.Flag.FOLDER) && isMultiFolderWorkspace()) {
      this.folderText = context.workspaceFolder!.name;
    }
    this.command = context.substitute(params.command);
    if (params.cwd) this.cwd = context.substitute(params.cwd);
    else if (context.workspaceFolder)
      this.cwd = context.workspaceFolder.uri.path;
    else if (workspace.workspaceFolders)
      this.cwd = workspace.workspaceFolders[0].uri.fsPath;
    else this.cwd = process.cwd();
    if (params.parseOutput) {
      switch (params.parseOutput.format) {
        case Cfg.LocationFormat.VIMGREP:
          this.parseFormat = ParseLocationFormat.VIMGREP;
          break;
        case Cfg.LocationFormat.GTAGS:
          this.parseFormat = ParseLocationFormat.GTAGS;
          break;
      }
      if (params.parseOutput.tag)
        this.parseTag = new RegExp(context.substitute(params.parseOutput.tag));
    }
  }

  async getLocations(): Promise<Location[]> {
    if (this.parseFormat === undefined)
      throw new Error("Output parsing not defined for this task");
    const output = await this.runAndGetOutput();
    const locations = parseLocations(output, this.cwd, this.parseFormat);
    if (this.parseTag) {
      return findPatternInParsedLocations(locations, new RegExp(this.parseTag));
    }
    return locations;
  }

  private async runAndGetOutput(): Promise<string> {
    const subproc = new Subprocess(this.command, {
      cwd: this.cwd,
      logLevel: LogLevel.DEBUG,
      statusBarMessage: this.info.label,
      allowedCodes: this.params.exitCodes,
    });
    try {
      const result = await subproc.wait();
      return result.stdout;
    } catch (err: unknown) {
      if (err instanceof ExecResult) {
        log.warn(
          `Task "${this.info.label}" failed with code ${err.code} signal ${err.signal}`,
        );
        return "";
      }
      throw err;
    }
  }

  async run() {
    if (this.parseFormat) {
      const locations = await this.getLocations();
      if (locations.isEmpty)
        log.warn(`Task "${this.info.label}" returned no locations`);
      else await peekLocations(locations);
    } else {
      await this.runAndGetOutput();
    }
  }
}

export class ProcessMultiTask extends BaseQcfgTask {
  private readonly parseOutput: boolean = false;
  private readonly folderTasks: ProcessTask[];

  constructor(
    params: Cfg.ProcessTaskParams,
    info: FetchInfo,
    folderContexts: TaskContext[],
  ) {
    super(params, info);
    this.folderTasks = folderContexts.map(
      (context) => new ProcessTask(params, info, context),
    );
    this.folderText = folderContexts
      .map((context) => context.workspaceFolder!.name)
      .join(", ");
    if (params.parseOutput) {
      this.parseOutput = true;
    }
    this.parseOutput = params.parseOutput !== undefined;
  }

  async getLocations() {
    const locsPerFolder = await mapAsync(this.folderTasks, async (task) =>
      task.getLocations(),
    );
    return concatArrays(...locsPerFolder);
  }

  async run() {
    if (this.parseOutput) {
      const locations = await this.getLocations();
      if (locations.isEmpty)
        log.warn(`Task "${this.info.label}" returned no locations`);
      else await peekLocations(locations);
    } else {
      await Promise.all(this.folderTasks.map(async (task) => task.run()));
    }
  }
}

export class SearchMultiTask extends BaseQcfgTask {
  private readonly query: TextSearchQuery;
  private readonly options: FindTextInFilesOptions;
  private readonly folders: WorkspaceFolder[];
  private readonly searchTitle: string;

  constructor(
    params: Cfg.SearchTaskParams,
    info: FetchInfo,
    folderContexts: TaskContext[],
  ) {
    super(params, info);
    this.folderText = folderContexts
      .map((context) => context.workspaceFolder!.name)
      .join(", ");

    this.folders = folderContexts.map((context) => {
      if (!context.workspaceFolder)
        throw new Error("Search task can only be defined for workspace folder");
      return context.workspaceFolder;
    });
    const flags = params.flags ?? [];
    this.query = {
      pattern: folderContexts[0].substitute(params.query),
      isRegExp: flags.includes(Cfg.Flag.REGEX),
      isCaseSensitive: flags.includes(Cfg.Flag.CASE),
      isWordMatch: flags.includes(Cfg.Flag.WORD),
    };
    this.searchTitle = params.searchTitle
      ? folderContexts[0].substitute(params.searchTitle)
      : `Query "${this.query.pattern}"`;
    this.options = {
      // XXX: there is a bug that happens when RelativePattern is used, it
      // causes search to return partial results, so we must use filtering
      // instead
      // include: new RelativePattern(context.workspaceFolder.uri.fsPath,
      // '**')
    };
  }

  async getLocations() {
    const locations = await searchInFiles(this.query, this.options);
    return locations.filter((location) => {
      const folder = getDocumentWorkspaceFolder(location.uri.fsPath);
      if (!folder) return false;
      return this.folders.includes(folder);
    });
  }

  async run() {
    return saveAndPeekSearch(this.searchTitle, async () => this.getLocations());
  }
}

export class SearchTask extends SearchMultiTask {
  constructor(
    params: Cfg.SearchTaskParams,
    info: FetchInfo,
    context: TaskContext,
  ) {
    super(params, info, [context]);
  }
}
