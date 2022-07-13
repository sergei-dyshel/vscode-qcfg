/**
 * Must be self-contained, e.g. do not import other modules
 * @module
 */

export namespace Config {
  /**
   * Collection of all configuration sections and corresponding value types.
   *
   * Used for auto-generation of `configuration` section of `package.json`.
   */
  export interface All {
    /**
     * Number of steps by which to auto-resize active editor
     * @default 1
     */
    'qcfg.autoResize.steps': number;

    /**
     * Whether auto-resize enabled
     * @default false
     */
    'qcfg.autoResize.enabled': boolean;
  }
}
