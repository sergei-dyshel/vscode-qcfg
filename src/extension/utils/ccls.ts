export namespace Ccls {
  export enum RefRole {
    DECLARATION = 1 << 0,
    DEFINITION = 1 << 1,
    REFERENCE = 1 << 2,
    READ = 1 << 3,
    WRITE = 1 << 4,
    CALL = 1 << 5,
    DYNAMIC = 1 << 6,
    ADDRESS = 1 << 7,
    IMPLICIT = 1 << 8,

    ASSIGNMENT = DEFINITION | WRITE | ADDRESS,
  }
}
