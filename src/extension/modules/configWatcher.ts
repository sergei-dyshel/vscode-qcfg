import type {
  ConfigurationChangeEvent,
  ConfigurationScope,
  ExtensionContext,
  WorkspaceFolder,
} from "vscode";
import { Uri, workspace } from "vscode";
import type { DisposableLike } from "../../library/disposable";
import { ArrayOfDisposables } from "../../library/disposable";
import { assert } from "../../library/exception";
import { log } from "../../library/logging";
import { DefaultMap } from "../../library/tsUtils";
import type {
  ConfigSection,
  Configuration,
  ConfigValue,
} from "../utils/configuration";
import { getConfiguration } from "../utils/configuration";
import { handleAsyncStd, listenWrapped } from "./exception";
import { Modules } from "./module";

/**
 * Watch and cache configuration for given sections.
 *
 * Optionally run callback on each change.
 */
export class ConfigurationWatcher<S extends ConfigSection> {
  initialized = false;

  constructor(
    private readonly sections: readonly S[],
    private readonly callback?: () => void | Promise<void>,
    private readonly options?: WatcherOptions,
  ) {}

  register(): DisposableLike {
    this.registered = true;
    if (this.callback) handleAsyncStd(this.callback());
    this.initialized = false;
    return watchers.pushDisposable(this, () => {
      this.registered = false;
      if (this.options?.onDispose) handleAsyncStd(this.options.onDispose);
    });
  }

  /**
   * Retrieve configuration of watched sections for given scope.
   *
   * If no configuration changes were made affecting watched sections then uses
   * cached value.
   */
  getConfiguration(scope?: ConfigurationScope): Configuration<S> {
    assert(this.registered, "Attemt to use unregistered watcher");

    if (!scope) {
      this.global ??= getConfiguration();
      return this.global;
    }

    if (scope instanceof Uri) {
      return this.fileMap.get(scope.toString());
    }

    // TextDocument
    if ("uri" in scope && "fileName" in scope) {
      return this.fileMap.get(scope.uri.toString());
    }

    // Workspace folder
    if ("uri" in scope && "name" in scope) {
      return this.folderMap.get(scope);
    }

    // { uri?: Uri, languageId: string}
    if ("languageId" in scope) {
      return this.languageMap.get(scope.languageId);
    }

    throw new Error(`Invalid scope: ${scope}`);
  }

  static onDidChangeConfiguration(event: ConfigurationChangeEvent) {
    for (const watcher of watchers) {
      let affects = false;
      for (const section of watcher.sections) {
        if (event.affectsConfiguration(section)) {
          if (!watcher.options?.noLogChange)
            log.info(`${section}: value changed`);
          affects = true;
        }
      }
      if (affects) {
        watcher.reset();
        if (watcher.callback) handleAsyncStd(watcher.callback());
      }
    }
  }

  private reset() {
    this.global = undefined;
    this.languageMap.clear();
    this.fileMap.clear();
    this.folderMap.clear();
  }

  private global?: Configuration<S>;

  private readonly languageMap = new DefaultMap<string, Configuration<S>>(
    (languageId) => getConfiguration<S>({ languageId }),
  );

  private readonly fileMap = new DefaultMap<string, Configuration<S>>(
    (uriStr) => getConfiguration<S>(Uri.parse(uriStr, true /* strict */)),
  );

  private readonly folderMap = new DefaultMap<
    WorkspaceFolder,
    Configuration<S>
  >((folder) => getConfiguration<S>(folder));

  private registered = false;
}

/**
 * Run callback when value of config section changes
 *
 * Suitable only for global config sections.
 */
export class ConfigSectionWatcher<
  K extends ConfigSection,
> extends ConfigurationWatcher<K> {
  value?: ConfigValue<K>;
  oldValue?: ConfigValue<K>;

  constructor(
    section: K,
    callback?: () => void | Promise<void>,
    options?: BaseWatcherOptions,
  ) {
    super(
      [section],
      () => {
        const config = this.getConfiguration();
        this.oldValue = this.value;
        this.value = config.get(section);
        if (this.initialized) {
          log.info(`${section}: value changed to`, this.value);
        } else {
          log.info(`${section}: initial value is`, this.value);
        }
        if (callback) return callback();
      },
      { noLogChange: true, ...options },
    );
  }
}

interface BaseWatcherOptions {
  /** Callback to run when watcher is disposed */
  onDispose?: () => void | Promise<void>;
}

interface WatcherOptions extends BaseWatcherOptions {
  /** Do not log when watched section value changes */
  noLogChange?: boolean;
}

const watchers = new ArrayOfDisposables<ConfigurationWatcher<ConfigSection>>();

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(
      workspace.onDidChangeConfiguration,
      ConfigurationWatcher.onDidChangeConfiguration,
    ),
  );
}

Modules.register(activate);
