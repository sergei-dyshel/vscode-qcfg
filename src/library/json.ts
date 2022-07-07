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
