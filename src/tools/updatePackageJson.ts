// these modify prototypes of bultin classes, must be imported first
import "../extension/utils/locationPrototype";
import "../extension/utils/positionPrototype";
import "../extension/utils/rangePrototype";
import "../extension/utils/uriPrototype";
import "../library/stringPrototype";
import "../library/tsUtils";

import { defaultCompare } from "../library/compare";
import type { ExtensionJSON } from "../library/extensionManifest";
import { globSync } from "../library/fileUtils";
import { JsoncEditor } from "../library/json";
import * as nodejs from "../library/nodejs";
import { generateCommands } from "./generateCommands";
import { generateConfig } from "./generateConfig";
import { generateMacTermBindings } from "./generateMacTermBindings";
import { generateRelativeJumps } from "./generateRelativeJumps";

const PACKAGE_JSON = "package.json";

async function main() {
  const commands: ExtensionJSON.Command[] = [];
  const keybindings: ExtensionJSON.KeyBinding[] = [];
  let configuration: Record<string, unknown> = {};

  const manifests: ExtensionJSON.Manifest[] = [];

  for (const file of globSync("package/*.json")) {
    const jsonText = nodejs.fs.readFileSync(file).toString();
    const json = JSON.parse(jsonText) as ExtensionJSON.Manifest;
    if (!json.contributes) {
      throw new Error(`No contribution points in ${file}`);
    }
    for (const key of Object.keys(json.contributes)) {
      if (!["keybindings", "commands", "configuration"].includes(key)) {
        throw new Error(`Unexpected contribution point "${key}" in ${file}`);
      }
    }
    manifests.push(json);
  }

  manifests.push(
    await generateCommands(),
    generateConfig(),
    generateMacTermBindings(),
    generateRelativeJumps(),
  );

  for (const json of manifests) {
    if (json.contributes?.commands) {
      commands.push(...json.contributes.commands);
    }
    if (json.contributes?.keybindings) {
      keybindings.push(...json.contributes.keybindings);
    }
    if (json.contributes?.configuration) {
      Object.assign(configuration, json.contributes.configuration.properties);
    }
  }

  commands.sort((cmd1, cmd2) => defaultCompare(cmd1.command, cmd2.command));
  keybindings.sort((kb1, kb2) => defaultCompare(kb1.key, kb2.key));
  keybindings.sort((kb1, kb2) => defaultCompare(kb1.command, kb2.command));
  configuration = Object.fromEntries(
    Object.entries(configuration).sort((e1, e2) =>
      defaultCompare(e1[0], e2[0]),
    ),
  );

  const oldText = nodejs.fs.readFileSync(PACKAGE_JSON).toString();

  const editor = new JsoncEditor(oldText);
  editor.options.formattingOptions = {
    tabSize: 2,
    insertSpaces: true,
  };

  editor.modify(["contributes", "commands"], commands);
  editor.modify(["contributes", "keybindings"], keybindings);
  editor.modify(["contributes", "configuration", "properties"], configuration);

  nodejs.fs.writeFileSync(PACKAGE_JSON, editor.text);

  const oldJson = JSON.parse(oldText) as ExtensionJSON.Manifest;
  const newJson = JSON.parse(editor.text) as ExtensionJSON.Manifest;
  console.log(
    "Number of commands changed from",
    oldJson.contributes!.commands!.length,
    "to",
    newJson.contributes!.commands!.length,
  );
  console.log(
    "Number of keybindings changed from",
    oldJson.contributes!.keybindings!.length,
    "to",
    newJson.contributes!.keybindings!.length,
  );
  console.log(
    "Number of configuration properties changed from",
    Object.keys(oldJson.contributes!.configuration!.properties).length,
    "to",
    Object.keys(newJson.contributes!.configuration!.properties).length,
  );
}

// eslint-disable-next-line unicorn/prefer-top-level-await
void main();
