/* eslint-disable class-methods-use-this */
/**
 * @file Integration with just ([casey/just](https://github.com/casey/just))
 *   command runner..
 */

import { filterNonNull, mapAsync } from "@sergei-dyshel/typescript/array";
import { zod } from "@sergei-dyshel/typescript/zod";
import path from "node:path";
import {
  CancellationToken,
  ExtensionContext,
  ProcessExecution,
  ProviderResult,
  Task,
  TaskProvider,
  tasks,
  window,
  workspace,
  WorkspaceFolder,
} from "vscode";
import { fileExists } from "../../library/fileUtils";
import { getConfiguration } from "../utils/configuration";
import { Modules } from "./module";
import { runSubprocessAndWait, SubprocessOptions } from "./subprocess";

const parameterSchema = zod.object({
  kind: zod.enum(["singular", "star", "plus"]),
  name: zod.string(),
});

const recipeSchema = zod.object({
  doc: zod.string().nullable(),
  parameters: zod.array(parameterSchema),
  name: zod.string(),
});

const justSchema = zod.object({
  recipes: zod.record(zod.string(), recipeSchema),
});

class JustTaskProvider implements TaskProvider {
  async provideTasks(_token: CancellationToken) {
    if (!workspace.workspaceFolders) return;
    const tasksByFolder = await mapAsync(
      workspace.workspaceFolders,
      async (folder) => this.getFolderTasks(folder),
    );
    const allTasks = tasksByFolder.flat();
    return allTasks;
  }

  async getFolderTasks(folder: WorkspaceFolder): Promise<Task[]> {
    const folderHasJustfile = (
      await mapAsync(
        ["Justfile", "justfile", "JUSTFILE", ".justfile"],
        async (file) => fileExists(path.join(folder.uri.fsPath, file)),
      )
    )
      // eslint-disable-next-line unicorn/no-await-expression-member
      .some(Boolean);
    if (!folderHasJustfile) return [];
    try {
      const result = await runJust(["--dump-format", "json", "--dump"], {
        cwd: folder.uri.fsPath,
      });
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const json = JSON.parse(result.stdout);
      const justFile = await justSchema.parseAsync(json);
      return filterNonNull(
        Object.values(justFile.recipes).map((recipe) =>
          this.recipeToTask(recipe, folder),
        ),
      );
    } catch (err) {
      void window.showErrorMessage(
        `Failed to get Just tasks in ${folder.name}: ${err}`,
      );
      return [];
    }
  }

  recipeToTask(
    recipe: zod.infer<typeof recipeSchema>,
    folder: WorkspaceFolder,
  ): Task | undefined {
    // only running parameter-less recipes or recipes with single star parameter
    if (recipe.parameters.length > 0) {
      if (recipe.parameters.length > 1) return;
      if (recipe.parameters[0].kind !== "star") return;
    }

    if (recipe.name.startsWith("_")) return;

    const cmd = [...getJustCmd(), recipe.name];

    const task = new Task(
      { type: "just", recipe: recipe.name },
      folder,
      recipe.name,
      "just",
      new ProcessExecution(cmd[0], cmd.slice(1), { cwd: folder.uri.fsPath }),
    );
    task.detail = recipe.doc || undefined;

    return task;
  }

  resolveTask(_task: Task, _token: CancellationToken): ProviderResult<Task> {
    throw new Error("Should not get here");
  }
}

function getJustCmd(): string[] {
  const configuration = getConfiguration();
  const cmd = configuration.get("qcfg.just.command");
  const fullCmd = typeof cmd === "string" ? [cmd] : cmd;
  return [...fullCmd];
}

function runJust(args: string[], options?: SubprocessOptions) {
  const fullCmd = getJustCmd();
  fullCmd.push(...args);
  return runSubprocessAndWait(fullCmd, options);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    tasks.registerTaskProvider("just", new JustTaskProvider()),
  );
}

Modules.register(activate);
