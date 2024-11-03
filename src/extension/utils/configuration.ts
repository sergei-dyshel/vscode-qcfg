import type { ConfigurationScope, WorkspaceConfiguration } from "vscode";
import { workspace } from "vscode";
import type { Config } from "../../library/config";
import { assertNotNull } from "../../library/exception";

/**
 * Configuration section, predefined in {@link Config.All}
 */
export type ConfigSection = keyof Config.All;

export type ConfigValue<S extends ConfigSection> = Config.All[S];

/**
 * Type-safe version of {@link `workspace.getConfiguration`}. The returned object
 * allow getting/setting only sections from `Config.All` but automatically
 * deduces value type from section.
 */
export function getConfiguration<S extends ConfigSection>(
  scope?: ConfigurationScope,
) {
  return new Configuration<S>(scope);
}

/**
 * Proxy for {@link WorkspaceConfiguration}.
 */
export class Configuration<S extends ConfigSection = ConfigSection> {
  private readonly configuration: WorkspaceConfiguration;

  constructor(scope?: ConfigurationScope) {
    this.configuration = workspace.getConfiguration(undefined, scope);
  }

  /** Similar to {@link WorkspaceConfiguration.get} */
  get<K extends S>(
    section: K,
    defaultValue: NonNullable<ConfigValue<K>>,
  ): NonNullable<ConfigValue<K>>;

  get<K extends S>(section: K): ConfigValue<K>;

  get<K extends S>(section: K, defaultValue?: ConfigValue<K>) {
    if (defaultValue)
      return this.configuration.get<ConfigValue<K>>(section, defaultValue);
    return this.configuration.get<ConfigValue<K>>(section);
  }

  /**
   * Like {@link get} but asserts that return value is not null
   *
   * It's better (safer) to use this method and `@default` JSdoc annotation tag
   * instead of {@link get}
   */
  getNotNull<K extends S>(section: K): ConfigValue<K> {
    const value = this.get<K>(section);
    assertNotNull(
      value,
      `Configuration section "${section}" is null/undefined`,
    );
    return value;
  }

  /** Similar to {@link WorkspaceConfiguration.has} */
  has<K extends S>(section: K) {
    return this.configuration.has(section);
  }

  /** Similar to {@link WorkspaceConfiguration.inspect} */
  inspect<K extends S>(section: K) {
    return this.configuration.inspect<ConfigValue<K>>(section);
  }
}
