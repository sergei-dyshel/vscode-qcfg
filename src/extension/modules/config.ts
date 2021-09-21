'use strict';

import type { ConfigurationChangeEvent, ExtensionContext } from 'vscode';
import { Disposable, workspace } from 'vscode';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { expandPath } from '../../library/pathUtils';
import type { DisposableLike } from '../../library/types';
import { listenWrapped } from './exception';
import { watchFile } from './fileUtils';
import { Modules } from './module';

/**
 * Subscribe to configuration updates on section
 */
export function watchConfigVariable(
  section: string,
  callback: () => unknown,
): DisposableLike {
  return listenWrapped(
    workspace.onDidChangeConfiguration,
    (event: ConfigurationChangeEvent) => {
      if (event.affectsConfiguration(section)) callback();
    },
  );
}

/**
 * Global and workspace config file paths, as returned by @watchConfigFile
 */
export interface ConfigFilePair {
  global?: string;
  workspace?: string;
}

/**
 * Watch configuration file in global in and workspace configuration directories
 */
export function watchConfigFile(
  fileName: string,
  callback: (_: ConfigFilePair) => unknown,
): { configFilePair: ConfigFilePair; disposable: DisposableLike } {
  const watcher = configDirWatcher.watch(fileName, callback);
  return { configFilePair: watcher.current(), disposable: watcher };
}

const GLOBAL_VAR = 'qcfg.configDir.global';
const WORKSPACE_VAR = 'qcfg.configDir.workspace';

function parseGlobalDir(): string {
  const raw = workspace.getConfiguration().get<string>(GLOBAL_VAR);
  const defaultValue = nodejs.os.homedir();
  if (!raw) return defaultValue;
  const expanded = expandPath(raw);
  if (!nodejs.path.isAbsolute(expanded)) {
    log.warn(`Global config dir path '${raw}' is not absolute`);
    return defaultValue;
  }
  return expanded;
}

/**
 * Get configuration file names (without checking if they exist)
 */
export function getConfigFileNames(fileName: string): ConfigFilePair {
  return configDirWatcher.getFileNames(fileName);
}

function getWorkspaceDir(): string | undefined {
  const root = workspace.workspaceFile;
  if (root) {
    if (root.scheme === 'untitled') return undefined;
    return nodejs.path.dirname(root.fsPath);
  }
  const folders = workspace.workspaceFolders;
  if (!folders) return undefined;
  return folders[0].uri.fsPath;
}

function parseWorkspaceDir(): string | undefined {
  const raw = workspace.getConfiguration().get<string>(WORKSPACE_VAR);
  const workspaceDir = getWorkspaceDir();
  if (!raw) return workspaceDir;
  if (nodejs.path.isAbsolute(raw)) return raw;
  if (!workspaceDir) return undefined;
  return nodejs.path.resolve(workspaceDir, raw);
}

/**
 * Watches global/workspace config dir variables in settings
 */
class ConfigDirWatcher implements Disposable {
  private globalDir = parseGlobalDir();
  private workspaceDir = parseWorkspaceDir();

  private readonly configDisposable = Disposable.from(
    watchConfigVariable(GLOBAL_VAR, this.onConfigVarChanged.bind(this)),
    watchConfigVariable(WORKSPACE_VAR, this.onConfigVarChanged.bind(this)),
  );

  private readonly pairWatchers = new Map<string, ConfigPairWatcher>();

  watch(
    fileName: string,
    callback: (_: ConfigFilePair) => unknown,
  ): ConfigPairWatcher {
    if (this.pairWatchers.has(fileName))
      throw new Error(
        `Configuration file "${fileName}" is already being watched`,
      );
    const watcher = new ConfigPairWatcher(
      fileName,
      this.globalDir,
      this.workspaceDir,
      callback,
      () => {
        this.pairWatchers.delete(fileName);
      },
    );
    this.pairWatchers.set(fileName, watcher);
    return watcher;
  }

  getFileNames(fileName: string): ConfigFilePair {
    return {
      global: nodejs.path.resolve(this.globalDir, fileName),
      workspace: this.workspaceDir
        ? nodejs.path.resolve(this.workspaceDir, fileName)
        : undefined,
    };
  }

  onConfigVarChanged() {
    this.globalDir = parseGlobalDir();
    this.workspaceDir = parseWorkspaceDir();
    this.pairWatchers.forEach((watcher) => {
      watcher.reset(this.globalDir, this.workspaceDir);
    });
  }

  dispose() {
    this.configDisposable.dispose();
    this.pairWatchers.forEach((pairWatcher) => {
      pairWatcher.dispose();
    });
  }
}

/**
 * Watches specific configuration file
 */
class ConfigFileWatcher implements DisposableLike {
  private watcher?: DisposableLike;

  constructor(
    public currentPath: string | undefined,
    private readonly callback: () => unknown,
  ) {
    this.watch();
  }

  reset(newPath: string | undefined) {
    this.dispose();
    this.currentPath = newPath;
    this.watch();
  }

  dispose() {
    if (this.watcher) this.watcher.dispose();
  }

  private watch() {
    if (this.currentPath)
      this.watcher = watchFile(this.currentPath, this.callback);
  }
}

function checkExists(path: string | undefined) {
  return path && nodejs.fs.existsSync(path) ? path : undefined;
}

function resolveIfNonNull(first: string | undefined, second: string) {
  return first ? nodejs.path.resolve(first, second) : undefined;
}

/**
 * Watches pair of global/workspace configuration files
 */
class ConfigPairWatcher implements DisposableLike {
  private readonly global: ConfigFileWatcher;
  private readonly workspace: ConfigFileWatcher;

  constructor(
    public fileName: string,
    globalDir: string,
    workspaceDir: string | undefined,
    private readonly callback: (_: ConfigFilePair) => unknown,
    private readonly onDispose: () => void,
  ) {
    this.global = new ConfigFileWatcher(
      nodejs.path.resolve(globalDir, fileName),
      this.onAnyChanged.bind(this),
    );
    this.workspace = new ConfigFileWatcher(
      resolveIfNonNull(workspaceDir, fileName),
      this.onAnyChanged.bind(this),
    );
  }

  reset(globalDir: string, workspaceDir: string | undefined) {
    this.global.reset(nodejs.path.resolve(globalDir, this.fileName));
    this.workspace.reset(resolveIfNonNull(workspaceDir, this.fileName));
  }

  current(): ConfigFilePair {
    return {
      global: checkExists(this.global.currentPath),
      workspace: checkExists(this.workspace.currentPath),
    };
  }

  dispose() {
    this.global.dispose();
    this.workspace.dispose();
    this.onDispose();
  }

  private onAnyChanged() {
    this.callback(this.current());
  }
}

let configDirWatcher: ConfigDirWatcher;

function activate(context: ExtensionContext) {
  configDirWatcher = new ConfigDirWatcher();
  context.subscriptions.push(configDirWatcher);
}

Modules.register(activate);
