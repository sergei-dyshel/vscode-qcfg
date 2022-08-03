/* eslint-disable unicorn/prefer-top-level-await */
import * as nodejs from '../library/nodejs';
import { UserCommands } from '../library/userCommands';

const jsonPath = nodejs.process.argv[2];

const modules = nodejs.process.argv.slice(3);

// eslint-disable-next-line @typescript-eslint/no-floating-promises
Promise.all(
  modules.map(
    async (module) => import(nodejs.path.join(nodejs.process.cwd(), module)),
  ),
).then(() => {
  const json = UserCommands.generateJson();
  nodejs.fs.writeFileSync(jsonPath, JSON.stringify(json, undefined, 2));
  console.log(`Written ${jsonPath}`);
  console.log(`${json.contributes!.commands!.length} commands`);
});
