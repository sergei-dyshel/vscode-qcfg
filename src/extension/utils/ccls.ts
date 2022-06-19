import { assert } from '../../library/exception';

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

  const refRoleStrings = {
    declaration: RefRole.DECLARATION,
    definition: RefRole.DEFINITION,
    reference: RefRole.REFERENCE,
    read: RefRole.READ,
    write: RefRole.WRITE,
    call: RefRole.CALL,
    dynamic: RefRole.DYNAMIC,
    address: RefRole.ADDRESS,
    implicit: RefRole.IMPLICIT,
  };

  export function refRoleFromString(role: string) {
    assert(allRefRoles.includes(role));
    return (refRoleStrings as Record<string, RefRole>)[role];
  }

  export const allRefRoles = Object.keys(refRoleStrings);
}
