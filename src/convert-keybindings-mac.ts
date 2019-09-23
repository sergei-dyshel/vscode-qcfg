'use strict';

import * as jsonc from 'jsonc-parser';
import * as fs from 'fs';

const path = process.argv[2];

const text = fs.readFileSync(path, 'utf8');
// const parsed = jsonc.parseTree(text);

const origin = JSON.parse(jsonc.stripComments(text));
interface KeyBinding {
  key: string;
}

const result = (origin as KeyBinding[]).map((binding => {
  const key = binding.key;
  const newKey = key.replace('ctrl+', 'cmd+');
  binding.key = newKey;
  return binding;
}));

const resultText = JSON.stringify(result, null, 8);

console.info(resultText);
// for (let i = 0; i < parsed.children!.length; ++i) {
//   const key = parsed.children![i];
//   console.info(key.children, jsonc.getNodePath(key));
// }