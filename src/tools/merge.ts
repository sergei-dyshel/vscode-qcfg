// eslint-disable-next-line import/no-extraneous-dependencies
import * as deepmerge from 'deepmerge';
import * as nodejs from '../library/nodejs';

const output = process.argv[2];
const args = process.argv.slice(3);
const jsons = args.map(
  (fname) =>
    JSON.parse(nodejs.fs.readFileSync(fname, 'utf8')) as Record<
      string,
      unknown
    >,
);

nodejs.fs.writeFileSync(
  output,
  JSON.stringify(deepmerge.all(jsons), undefined, 2),
);
