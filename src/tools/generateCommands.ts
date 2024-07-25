/* eslint-disable unicorn/prefer-top-level-await */
import { UserCommands } from "../library/userCommands";

import "../extension/allModules";

export function generateCommands() {
  return UserCommands.generateJson();
}
