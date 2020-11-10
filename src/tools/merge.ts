'use strict';

// eslint-disable-next-line import/no-extraneous-dependencies
import * as deepmerge from 'deepmerge';
import * as fs from 'fs';

const output = process.argv[2];
const args = process.argv.slice(3);
const jsons = args.map((fname) => JSON.parse(fs.readFileSync(fname, 'utf8')));

fs.writeFileSync(output, JSON.stringify(deepmerge.all(jsons), null, 2));
