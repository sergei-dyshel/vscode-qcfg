import * as nodejs from "./nodejs";

export const mkdir = nodejs.util.promisify(nodejs.fs.mkdir);

export const writeFile = nodejs.util.promisify(nodejs.fs.writeFile);

export const readFile = nodejs.util.promisify(nodejs.fs.readFile);
