import type { ConfigurationScope, WorkspaceConfiguration } from 'vscode';
import { workspace } from 'vscode';
import type { Config } from '../../library/config';
import { assertNotNull } from '../../library/exception';

/**
 * Type-safe version of {@link `workspace.getConfiguration`}. The returned
 * object allow getting/setting only sections from `Config.All`
 * but automatically deduces value type from section.
 */
export function getConfiguration(scope?: ConfigurationScope) {
  return new Configuration(scope);
}

export class Configuration {
  private readonly configuration: WorkspaceConfiguration;

  constructor(scope?: ConfigurationScope) {
    this.configuration = workspace.getConfiguration(undefined, scope);
  }

  /** Similar to {@link WorkspaceConfiguration.get} */
  get<K extends keyof Config.All, V extends Config.All[K] = Config.All[K]>(
    section: K,
    defaultValue: V,
  ): V;

  get<K extends keyof Config.All, V extends Config.All[K] = Config.All[K]>(
    section: K,
  ): V | undefined;

  get<K extends keyof Config.All, V extends Config.All[K] = Config.All[K]>(
    section: K,
    defaultValue?: V,
  ) {
    if (defaultValue) return this.configuration.get<V>(section, defaultValue);
    return this.configuration.get<V>(section);
  }

  /** Like {@link get} but asserts that return value is not null */
  getNotNull<
    K extends keyof Config.All,
    V extends Config.All[K] = Config.All[K],
  >(section: K): V {
    const value = this.get<K, V>(section);
    assertNotNull(
      value,
      `Configuration section "${section}" is null/undefined`,
    );
    return value;
  }

  /** Similar to {@link WorkspaceConfiguration.has} */
  has<K extends keyof Config.All>(section: K) {
    return this.configuration.has(section);
  }

  /** Similar to {@link WorkspaceConfiguration.inspect} */
  inspect<K extends keyof Config.All, V extends Config.All[K] = Config.All[K]>(
    section: K,
  ) {
    return this.configuration.inspect<V>(section);
  }
}
