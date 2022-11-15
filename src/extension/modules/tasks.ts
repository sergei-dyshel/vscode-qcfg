import type { ExtensionContext, Task, WorkspaceFolder } from 'vscode';
import { commands, TaskGroup, tasks as vstasks, workspace } from 'vscode';
import { Config } from '../../library/config';
import { globAsync } from '../../library/fileUtils';
import { log } from '../../library/logging';
import { concatArrays, mapObjectToArray } from '../../library/tsUtils';
import { UserCommands } from '../../library/userCommands';
import { getConfiguration } from '../utils/configuration';
import { PersistentGenericQuickPick } from '../utils/quickPickPersistent';
import { getValidWorkspaceFolders } from '../utils/workspace';
import { filterAsync, mapSomeAsync, MAP_UNDEFINED } from './async';
import { Modules } from './module';
import type {
  BaseQcfgTask,
  BaseTask,
  FetchInfo,
  ParamsSource,
} from './tasks/types';
import {
  ConditionError,
  isFolderTask,
  ParamsError,
  ProcessMultiTask,
  ProcessTask,
  SearchMultiTask,
  SearchTask,
  TaskContext,
  TerminalMultiTask,
  TerminalTask,
  ValidationError,
  VscodeTask,
} from './tasks/types';
import { currentWorkspaceFolder } from './utils';

import Cfg = Config.Tasks;

export async function runTask(
  label: string,
  params: Cfg.Params,
  options?: TaskRunOptions,
) {
  const fetchedParams: FetchedParams = {
    params,
    fetchInfo: { label, source: {} },
  };
  const task = await createTask(fetchedParams, options);
  await task.run();
}

export async function runTaskAndGetLocations(
  label: string,
  params: Cfg.ProcessTaskParams,
  options?: TaskRunOptions,
) {
  const fetchedParams: FetchedParams = {
    params,
    fetchInfo: { label, source: {} },
  };
  const task = await createTask(fetchedParams, options);
  if (task instanceof ProcessTask) return task.getLocations();
  if (task instanceof ProcessMultiTask) return task.getLocations();
  throw new Error('Expected to create a process task');
}

interface TaskRunOptions {
  folder?: 'all' | WorkspaceFolder;
}

//
// Private
//

async function checkCondition(
  params: Cfg.BaseTaskParams,
  context: TaskContext,
): Promise<void> {
  const when = params.when ?? {};
  if (Object.keys(when).length > 1)
    throw new ParamsError("Only one property can be defined for 'when' clause");
  if (when.fileExists) {
    if (!context.workspaceFolder)
      throw new ConditionError(
        '"fileExists" can only be checked in context of workspace folder',
      );
    const matches = await globAsync(when.fileExists, {
      cwd: context.workspaceFolder.uri.path,
    });
    if (matches.isEmpty)
      throw new ConditionError(
        `Globbing for ${when.fileExists} returned no matches`,
      );
  } else if (when.fileMatches) {
    throw new ParamsError('TODO: when.fileMatches not implemented yet');
  }
}

function handleValidationError(
  label: string,
  context: TaskContext | undefined,
  err: unknown,
) {
  // eslint-disable-next-line no-nested-ternary
  const contextStr = context
    ? context.workspaceFolder
      ? 'folder ' + context.workspaceFolder.name
      : 'current context'
    : 'multiple folders';
  if (err instanceof ValidationError)
    log.debug(
      `Error validating task "${label}" for ${contextStr}: ${err.message}`,
    );
  else {
    throw err;
  }
}

type FolderTask<P> = new (
  params: P,
  info: FetchInfo,
  context: TaskContext,
) => BaseQcfgTask;

type MultiFolderTask<P> = new (
  params: P,
  info: FetchInfo,
  folderContexts: TaskContext[],
) => BaseQcfgTask;

class TaskGenerator<P extends Cfg.BaseTaskParams> {
  constructor(
    private readonly single: FolderTask<P>,
    private readonly multi: MultiFolderTask<P>,
    private readonly params: P,
    private readonly info: FetchInfo,
  ) {}

  async generateAll(
    currentContext: TaskContext,
    folderContexts: TaskContext[],
  ) {
    if (isFolderTask(this.params)) return this.genFolderTasks(folderContexts);
    return this.genCurrentTask(currentContext);
  }

  async createTask(context: TaskContext) {
    await checkCondition(this.params, context);
    // eslint-disable-next-line new-cap
    return new this.single(this.params, this.info, context);
  }

  private async filterValidContexts(folderContexts: TaskContext[]) {
    return filterAsync(folderContexts, async (context) => {
      if (
        this.params.folders &&
        !this.params.folders.includes(context.workspaceFolder!.name)
      )
        return false;
      try {
        await this.createTask(context);
        return true;
      } catch (err: unknown) {
        handleValidationError(this.info.label, context, err);
        return false;
      }
    });
  }

  async genMultiTask(folderContexts: TaskContext[]) {
    const validContexts = await this.filterValidContexts(folderContexts);
    if (validContexts.isEmpty)
      throw new Error(`Task "${this.info.label}" is not valid for any folder`);
    // eslint-disable-next-line new-cap
    return new this.multi(this.params, this.info, validContexts);
  }

  private async genFolderTasks(folderContexts: TaskContext[]) {
    const validContexts = await this.filterValidContexts(folderContexts);
    const tasks: BaseQcfgTask[] = [];
    if (validContexts.isEmpty) return tasks;
    if (validContexts.length === 1)
      tasks.push(await this.createTask(validContexts[0]));
    else {
      const currentFolder = currentWorkspaceFolder();
      for (const context of validContexts) {
        if (context.workspaceFolder === currentFolder)
          tasks.push(await this.createTask(context));
      }
      // eslint-disable-next-line new-cap
      tasks.push(new this.multi(this.params, this.info, validContexts));
    }
    return tasks;
  }

  private async genCurrentTask(currentContext: TaskContext) {
    try {
      return [await this.createTask(currentContext)];
    } catch (err: unknown) {
      handleValidationError(this.info.label, currentContext, err);
      return [];
    }
  }
}

function createTaskGenerator(fetchedParams: FetchedParams) {
  const { fetchInfo, params } = fetchedParams;
  switch (params.type) {
    case Cfg.TaskType.PROCESS:
      return new TaskGenerator<Cfg.ProcessTaskParams>(
        ProcessTask,
        ProcessMultiTask,
        params,
        fetchInfo,
      );
    case Cfg.TaskType.TERMINAL:
      return new TaskGenerator<Cfg.TerminalTaskParams>(
        TerminalTask,
        TerminalMultiTask,
        params,
        fetchInfo,
      );
    case Cfg.TaskType.SEARCH:
      return new TaskGenerator<Cfg.SearchTaskParams>(
        SearchTask,
        SearchMultiTask,
        params,
        fetchInfo,
      );
  }
}

interface FetchOptions {
  showHidden?: boolean;
}

async function fetchQcfgTasks(options?: FetchOptions): Promise<BaseQcfgTask[]> {
  const currentContext = new TaskContext();
  const curFolder = currentWorkspaceFolder();
  const folders = [...(workspace.workspaceFolders ?? [])];

  // move current folder to the top of list
  if (curFolder) {
    folders.removeFirst(curFolder);
    folders.unshift(curFolder);
  }

  const folderContexts = folders.map((folder) => new TaskContext(folder));

  // TODO: fetch per folder
  const filteredParams = fetchAllParams().filter((fetchedParams) => {
    const { params } = fetchedParams;
    if (!params.flags) params.flags = [];
    return !(params.flags.includes(Cfg.Flag.HIDDEN) && !options?.showHidden);
  });

  const tasks = await mapSomeAsync<FetchedParams, BaseQcfgTask[]>(
    filteredParams,
    async (fetchedParams) => {
      try {
        const generator = createTaskGenerator(fetchedParams);
        return await generator.generateAll(currentContext, folderContexts);
      } catch (err: unknown) {
        if (err instanceof ParamsError) {
          log.warn(
            `Error in parameters for task "${fetchedParams.fetchInfo.label}": ${err.message}`,
          );
          return MAP_UNDEFINED;
        }
        throw err;
      }
    },
  );

  return concatArrays(...tasks);
}

let lastBuildTask: BaseTask | undefined;

async function runDefaultBuildTask() {
  const qcfgTasks = await fetchQcfgTasks();
  for (const task of qcfgTasks) if (task.label === 'build') return task.run();
  const allTasks = await vstasks.fetchTasks();
  for (const task of allTasks)
    if (task.group === TaskGroup.Build)
      return commands
        .executeCommand('workbench.action.tasks.build')
        .ignoreResult();
}

async function runLastBuildTask() {
  if (lastBuildTask) {
    await lastBuildTask.run();
    return;
  }
  await runDefaultBuildTask();
}

function expandParamsOrCmd(paramsOrCmd: Cfg.Params | string): Cfg.Params {
  return typeof paramsOrCmd === 'string'
    ? { command: paramsOrCmd, type: Cfg.TaskType.TERMINAL }
    : paramsOrCmd;
}

async function fetchVscodeTasksChecked(): Promise<Task[]> {
  try {
    return await vstasks.fetchTasks();
  } catch (err: unknown) {
    log.error('Error fetching vscode tasks: ', err);
    return [];
  }
}

async function showTasks() {
  const [qcfgTasks, rawVscodeTasks] = await Promise.all([
    fetchQcfgTasks(),
    fetchVscodeTasksChecked(),
  ]);
  const vscodeTasks = rawVscodeTasks.map((task) => new VscodeTask(task));
  const allTasks = [...qcfgTasks, ...vscodeTasks];
  const qp = new PersistentGenericQuickPick(
    (item) => item.toQuickPickItem(),
    (item) => item.toPersistentLabel(),
    'tasks',
    allTasks,
  );
  const anyTask = await qp.select();
  if (!anyTask) return;
  if (anyTask.isBuild()) lastBuildTask = anyTask;
  await anyTask.run();
}

async function createTask(
  fetchedParams: FetchedParams,
  options?: TaskRunOptions,
): Promise<BaseQcfgTask> {
  const generator = createTaskGenerator(fetchedParams);
  const { fetchInfo, params } = fetchedParams;
  const { label } = fetchInfo;
  if (options?.folder) {
    if (options.folder === 'all') {
      if (isFolderTask(params)) {
        const folders = (await getValidWorkspaceFolders()) ?? [];
        if (folders.isEmpty)
          throw new Error(`Task "${label}" can only run in workspace folder`);
        const folderContexts = folders.map((folder) => new TaskContext(folder));
        return generator.genMultiTask(folderContexts);
      }
      throw new Error(`Task "${label}" is not folder task`);
    }
    try {
      return await generator.createTask(new TaskContext(options.folder));
    } catch (err: unknown) {
      throw new Error(
        `Task "${label}" is not valid in folder "${options.folder.name}": ${err}`,
      );
    }
  }
  try {
    return await generator.createTask(new TaskContext());
  } catch (err: unknown) {
    throw new Error(`Task "${label}" is not valid current context : ${err}`);
  }
}

async function runConfiguredTask(name: string, options?: TaskRunOptions) {
  const fetchedParams = fetchAllParams().firstOf(
    (fp) => fp.fetchInfo.label === name,
  );
  if (!fetchedParams) throw new Error(`Task "${name}" is not available`);
  const task = await createTask(fetchedParams, options);
  await task.run();
}

interface FetchedParams {
  fetchInfo: FetchInfo;
  params: Cfg.Params;
}

function combineParamsWithSource(
  tasks: Cfg.ConfParamsSet | undefined,
  source: ParamsSource,
): FetchedParams[] {
  if (!tasks) return [];
  return mapObjectToArray(tasks, (label, paramsOrCmd) => ({
    fetchInfo: { label, source },
    params: expandParamsOrCmd(paramsOrCmd),
  }));
}

function fetchAllParams() {
  const inspect = getConfiguration().inspect('qcfg.tasks');
  // when just folder is opened `inspect` will return its config value
  // as `workspaceValue` so we throw it away as we populate tasks from folders
  // separately
  const workspaceTasks = workspace.workspaceFile
    ? inspect?.workspaceValue ?? {}
    : {};
  const allTasks: FetchedParams[] = [];
  for (const folder of workspace.workspaceFolders ?? []) {
    const inspectFolder = getConfiguration(folder).inspect('qcfg.tasks');
    allTasks.push(
      ...combineParamsWithSource(inspectFolder?.workspaceFolderValue, {
        folder,
      }),
    );
  }
  allTasks.push(
    ...combineParamsWithSource(workspaceTasks, { workspace: true }),
    ...combineParamsWithSource(inspect?.globalValue, {}),
  );
  return allTasks;
}

function registerTaskCommand(
  ...cmds: Array<
    Omit<UserCommands.Command, 'callback'> & {
      task: {
        name: string;
        options?: TaskRunOptions;
      };
    }
  >
) {
  UserCommands.register(
    ...cmds.map((cmd) => ({
      command: cmd.command,
      title: cmd.title,
      keybinding: cmd.keybinding,
      callback: async () => runConfiguredTask(cmd.task.name, cmd.task.options),
    })),
  );
}

UserCommands.register(
  {
    command: 'qcfg.tasks.build.last',
    title: 'Run last build task',
    keybinding: {
      key: 'cmd+k cmd+b',
    },
    callback: runLastBuildTask,
  },
  {
    command: 'qcfg.tasks.show',
    title: 'Show list of tasks',
    keybinding: {
      key: 'alt+t',
    },
    callback: showTasks,
  },
  {
    command: 'qcfg.tasks.build.default',
    title: 'Run default build task',
    keybinding: {
      key: 'cmd+k cmd+shift+b',
    },
    callback: runDefaultBuildTask,
  },
);

registerTaskCommand(
  {
    command: 'qcfg.jump2line',
    title: 'Jump to line',
    keybinding: 'cmd+k cmd+l',
    task: {
      name: 'jump2line',
      options: {
        folder: 'all',
      },
    },
  },
  {
    command: 'qcfg.syg',
    title: 'Syg',
    keybinding: 'alt+s',
    task: {
      name: 'syg',
      options: {
        folder: 'all',
      },
    },
  },
);

// eslint-disable-next-line @typescript-eslint/no-empty-function
function activate(_context: ExtensionContext) {}

Modules.register(activate);
