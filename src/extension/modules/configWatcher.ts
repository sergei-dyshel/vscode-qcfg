import type {
  ConfigurationChangeEvent,
  ConfigurationScope,
  ExtensionContext,
} from 'vscode';
import { workspace } from 'vscode';
import type { Config } from '../../library/config';
import type { DisposableLike } from '../../library/disposable';
import { ArrayOfDisposables } from '../../library/disposable';
import { DefaultMap } from '../../library/tsUtils';
import type { Configuration } from '../utils/configuration';
import { getConfiguration } from '../utils/configuration';
import { handleAsyncStd, listenWrapped } from './exception';
import { Modules } from './module';

/**
 * Run `callback` when config `section` changes within `scope`
 */
export function watchConfiguration<
  K extends keyof Config.All,
  V extends Config.All[K] = Config.All[K],
>(
  section: K,
  callback: WatcherCallback<V>,
  scope?: ConfigurationScope,
): DisposableLike {
  const config = getConfiguration(scope);
  handleAsyncStd(callback(config.get(section), config));
  return watchers.get(scope).pushDisposable({ section, callback });
}

type WatcherCallback<V> = (
  value: V | undefined,
  configuration: Configuration,
) => void | Promise<void>;

interface Watcher {
  section: keyof Config.All;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  callback: WatcherCallback<any>;
}

const watchers = new DefaultMap<
  ConfigurationScope | undefined,
  ArrayOfDisposables<Watcher>
>(() => new ArrayOfDisposables<Watcher>());

function onDidChangeConfiguration(event: ConfigurationChangeEvent) {
  for (const [scope, scopeWatchers] of watchers) {
    const config = getConfiguration(scope);
    for (const watcher of scopeWatchers) {
      if (event.affectsConfiguration(watcher.section, scope))
        handleAsyncStd(watcher.callback(config.get(watcher.section), config));
    }
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidChangeConfiguration, onDidChangeConfiguration),
  );
}

Modules.register(activate);
