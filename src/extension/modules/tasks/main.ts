'use strict';

import {
  commands,
  ExtensionContext,
  TaskGroup,
  tasks as vstasks,
  workspace,
  WorkspaceFolder,
  window,
  Uri,
  Task,
} from 'vscode';
import { mapSomeAsync, MAP_UNDEFINED, filterAsync } from '../async';
import { ConfigFilePair, watchConfigFile, getConfigFileNames } from '../config';
import * as dialog from '../dialog';
import { registerAsyncCommandWrapped } from '../exception';
import { globAsync } from '../fileUtils';
import { parseJsonFileSync } from '../json';
import { log } from '../logging';
import { Modules } from '../module';
import { concatArrays, mapObjectToArray } from '../../../library/tsUtils';
import { currentWorkspaceFolder } from '../utils';
import {
  ConfParamsSet,
  Params,
  TerminalTaskParams,
  TaskType,
  ProcessTaskParams,
  Flag,
  SearchTaskParams,
  BaseTaskParams,
} from './params';
import {
  TaskContext,
  ConditionError,
  ParamsError,
  TerminalTask,
  TerminalMultiTask,
  BaseQcfgTask,
  VscodeTask,
  BaseTask,
  ValidationError,
  FetchInfo,
  ProcessTask,
  ProcessMultiTask,
  SearchTask,
  SearchMultiTask,
  isFolderTask,
} from './types';
import * as nodejs from '../../../library/nodejs';

const CONFIG_FILE = 'vscode-qcfg.tasks.json';

export async function runTask(
  label: string,
  params: Params,
  options?: TaskRunOptions,
) {
  const fetchedParams = { params, fetchInfo: { label, fromWorkspace: false } };
  const task = await createTask(fetchedParams, options);
  await task.run();
}

interface TaskRunOptions {
  folder?: 'all' | WorkspaceFolder;
}

//
// Private
//

async function checkCondition(
  params: BaseTaskParams,
  context: TaskContext,
): Promise<void> {
  const when = params.when || {};
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

interface FolderTask<P> {
  new (params: P, info: FetchInfo, context: TaskContext): BaseQcfgTask;
}

interface MultiFolderTask<P> {
  new (params: P, info: FetchInfo, folderContexts: TaskContext[]): BaseQcfgTask;
}

class TaskGenerator<P extends BaseTaskParams> {
  constructor(
    private single: FolderTask<P>,
    private multi: MultiFolderTask<P>,
    private params: P,
    private info: FetchInfo,
  ) {}

  generateAll(currentContext: TaskContext, folderContexts: TaskContext[]) {
    if (isFolderTask(this.params)) return this.genFolderTasks(folderContexts);
    return this.genCurrentTask(currentContext);
  }

  async createTask(context: TaskContext) {
    await checkCondition(this.params, context);
    // eslint-disable-next-line new-cap
    return new this.single(this.params, this.info, context);
  }

  private async filterValidContexts(folderContexts: TaskContext[]) {
    return filterAsync(folderContexts, async context => {
      if (
        this.params.folders &&
        !this.params.folders.includes(context.workspaceFolder!.name)
      )
        return false;
      try {
        await this.createTask(context);
        return true;
      } catch (err) {
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
    } catch (err) {
      handleValidationError(this.info.label, currentContext, err);
      return [];
    }
  }
}

function createTaskGenerator(fetchedParams: FetchedParams) {
  const { fetchInfo, params } = fetchedParams;
  switch (params.type) {
    case TaskType.PROCESS:
      return new TaskGenerator<ProcessTaskParams>(
        ProcessTask,
        ProcessMultiTask,
        params,
        fetchInfo,
      );
    case TaskType.TERMINAL:
      return new TaskGenerator<TerminalTaskParams>(
        TerminalTask,
        TerminalMultiTask,
        params,
        fetchInfo,
      );
    case TaskType.SEARCH:
      return new TaskGenerator<SearchTaskParams>(
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
  const folders = workspace.workspaceFolders || [];

  // move current folder to the top of list
  if (curFolder) {
    folders.removeFirst(curFolder);
    folders.unshift(curFolder);
  }

  const folderContexts = folders.map(folder => new TaskContext(folder));

  const filteredParams = configuredParams.filter(fetchedParams => {
    const { params } = fetchedParams;
    if (!params.flags) params.flags = [];
    if (params.flags.includes(Flag.HIDDEN) && !(options || {}).showHidden)
      return false;
    return true;
  });

  const tasks = await mapSomeAsync<FetchedParams, BaseQcfgTask[]>(
    filteredParams,
    async fetchedParams => {
      try {
        const generator = createTaskGenerator(fetchedParams);
        return generator.generateAll(currentContext, folderContexts);
      } catch (err) {
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
      return commands.executeCommand('workbench.action.tasks.build');
}

async function runLastBuildTask() {
  if (lastBuildTask) {
    await lastBuildTask.run();
    return;
  }
  await runDefaultBuildTask();
}

function expandParamsOrCmd(paramsOrCmd: Params | string): Params {
  return typeof paramsOrCmd === 'string'
    ? { command: paramsOrCmd, type: TaskType.TERMINAL }
    : paramsOrCmd;
}

async function fetchVscodeTasksChecked(): Promise<Task[]> {
  try {
    return await vstasks.fetchTasks();
  } catch (err) {
    log.error('Error fetching vscode tasks: ', err);
    return [];
  }
}

async function showTasks() {
  const [qcfgTasks, rawVscodeTasks] = await Promise.all([
    fetchQcfgTasks(),
    fetchVscodeTasksChecked(),
  ]);
  const vscodeTasks = rawVscodeTasks.map(task => new VscodeTask(task));
  const allTasks = [...qcfgTasks, ...vscodeTasks];
  const anyTask = await dialog.selectObjectFromListMru(allTasks, 'tasks');
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
  if (options && options.folder) {
    if (options.folder === 'all') {
      if (isFolderTask(params)) {
        const folders = workspace.workspaceFolders || [];
        if (folders.isEmpty)
          throw new Error(`Task "${label}" can only run in workspace folder`);
        const folderContexts = folders.map(folder => new TaskContext(folder));
        return generator.genMultiTask(folderContexts);
      }
      throw new Error(`Task "${label}" is not folder task`);
    }
    try {
      return generator.createTask(new TaskContext(options.folder));
    } catch (err) {
      throw new Error(
        `Task "${label}" is not valid in folder "${options.folder.name}": ${err.message}`,
      );
    }
  }
  try {
    return generator.createTask(new TaskContext());
  } catch (err) {
    throw new Error(
      `Task "${label}" is not valid current context : ${err.message}`,
    );
  }
}

async function runConfiguredTask(name: string, options?: TaskRunOptions) {
  const fetchedParams = configuredParams.firstOf(
    fp => fp.fetchInfo.label === name,
  );
  if (!fetchedParams) throw new Error(`Task "${name}" is not available`);
  const task = await createTask(fetchedParams, options);
  await task.run();
}

async function runConfiguredTaskCmd(arg: string | [string, TaskRunOptions]) {
  if (typeof arg === 'string') await runConfiguredTask(arg);
  else await runConfiguredTask(...arg);
}

interface FetchedParams {
  fetchInfo: FetchInfo;
  params: Params;
}

const configuredParams: FetchedParams[] = [];

function loadConfig(filePair: ConfigFilePair) {
  const allTasks: ConfParamsSet = {};
  let workspaceTasks: ConfParamsSet = {};
  if (filePair.global) {
    try {
      const globalTasks = parseJsonFileSync(filePair.global) as ConfParamsSet;
      log.debug('Loaded tasks from ' + filePair.global);
      Object.assign(allTasks, globalTasks);
    } catch (err) {
      log.error(`Could not load JSON file ${filePair.global}: ${err}`);
    }
  }
  if (filePair.workspace) {
    try {
      workspaceTasks = parseJsonFileSync(filePair.workspace) as ConfParamsSet;
      log.debug('Loaded tasks from ' + filePair.workspace);
      Object.assign(allTasks, workspaceTasks);
    } catch (err) {
      log.error(`Could not load JSON file ${filePair.workspace}: ${err}`);
    }
  }
  if (!filePair.global && !filePair.workspace)
    log.info('No tasks config files found');
  configuredParams.length = 0;
  configuredParams.push(
    ...mapObjectToArray(allTasks, (label, paramsOrCmd) => {
      // tslint:disable-next-line: strict-type-predicates
      const fromWorkspace = workspaceTasks[label] !== undefined;
      const fetchInfo: FetchInfo = { label, fromWorkspace };
      return { fetchInfo, params: expandParamsOrCmd(paramsOrCmd) };
    }),
  );
}

async function editGlobalConfig() {
  const confFilePair = getConfigFileNames(CONFIG_FILE);
  await window.showTextDocument(Uri.file(confFilePair.global!));
}

async function editWorkspaceConfig() {
  const confFilePair = getConfigFileNames(CONFIG_FILE);
  if (!confFilePair.workspace)
    throw Error('Workspace configuration file not defined!');
  if (!nodejs.fs.existsSync(confFilePair.workspace))
    await window.showTextDocument(
      Uri.parse('untitled:' + confFilePair.workspace),
    );
  else await window.showTextDocument(Uri.file(confFilePair.workspace));
}

function activate(context: ExtensionContext) {
  const { configFilePair, disposable } = watchConfigFile(
    CONFIG_FILE,
    loadConfig,
  );
  loadConfig(configFilePair);
  context.subscriptions.push(
    disposable,
    registerAsyncCommandWrapped('qcfg.tasks.build.last', runLastBuildTask),
    registerAsyncCommandWrapped(
      'qcfg.tasks.build.default',
      runDefaultBuildTask,
    ),
    registerAsyncCommandWrapped(
      'qcfg.tasks.runConfigured',
      runConfiguredTaskCmd,
    ),
    registerAsyncCommandWrapped(
      'qcfg.tasks.editGlobalConfig',
      editGlobalConfig,
    ),
    registerAsyncCommandWrapped(
      'qcfg.tasks.editWorkspaceConfig',
      editWorkspaceConfig,
    ),
    registerAsyncCommandWrapped('qcfg.tasks.show', showTasks),
  );
}

Modules.register(activate);
