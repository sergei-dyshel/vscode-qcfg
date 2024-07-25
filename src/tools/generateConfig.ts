import zodToJsonSchema from "zod-to-json-schema";
import { Config } from "../library/config";
import type { ExtensionJSON } from "../library/extensionManifest";

export function generateConfig() {
  const schema = zodToJsonSchema(Config.allSchema, { $refStrategy: "none" });
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
  const properties = (schema as any).properties;
  properties["qcfg.tasks"].scope = "resource";

  const pkg: ExtensionJSON.Manifest = {
    contributes: {
      configuration: {
        title: "Qcfg configuration",
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        properties,
      },
    },
  };

  return pkg;
}
