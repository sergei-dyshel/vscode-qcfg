import * as jsonc from 'jsonc-parser';

/**
 * Wrapper over `jsonc-parser` to edit JSONC files
 */
export class JsoncEditor {
  options: jsonc.ModificationOptions = {};

  constructor(public text: string) {}

  modify(jsonPath: jsonc.JSONPath, value: unknown) {
    const edits = jsonc.modify(this.text, jsonPath, value, this.options);
    this.text = jsonc.applyEdits(this.text, edits);
  }
}

/**
 * JSON types
 */

export namespace JsonTypes {
  export type Primitive = string | number | boolean | null;
  export interface Obj {
    [key: string]: Primitive | Obj | Arr;
  }
  export type Arr = Array<Primitive | Obj | Arr>;
  export type Any = Primitive | Obj | Arr;
}
