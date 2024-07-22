import * as jsonc from "jsonc-parser";
import * as nodejs from "../library/nodejs";

const path = process.argv[2];

const text = nodejs.fs.readFileSync(path, "utf8");
// const parsed = jsonc.parseTree(text);

const origin = JSON.parse(jsonc.stripComments(text)) as KeyBinding[];
interface KeyBinding {
  key: string;
}

const result = origin.map((binding) => {
  const key = binding.key;
  const newKey = key.replace("ctrl+", "cmd+");
  binding.key = newKey;
  return binding;
});

const resultText = JSON.stringify(result, undefined, 8);

console.info(resultText);
// for (let i = 0; i < parsed.children!.length; ++i) {
//   const key = parsed.children![i];
//   console.info(key.children, jsonc.getNodePath(key));
// }
