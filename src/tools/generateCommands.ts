/* eslint-disable unicorn/prefer-top-level-await */
import { globSync } from "../library/fileUtils";
import * as nodejs from "../library/nodejs";
import { UserCommands } from "../library/userCommands";

export async function generateCommands() {
  const modules = globSync("src/extension/modules/*.ts");

  await Promise.all(
    modules.map(
      async (module) => import(nodejs.path.join(nodejs.process.cwd(), module)),
    ),
  );

  return UserCommands.generateJson();
}
