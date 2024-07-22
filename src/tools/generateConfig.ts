import * as tsj from 'ts-json-schema-generator';
import type { ExtensionJSON } from '../library/extensionManifest';
import type { Config } from '../library/config';

export function generateConfig() {
  const config: tsj.Config = {
    path: 'src/library/config.ts',
    tsconfig: 'tsconfig.json',
    type: 'Config.All',
    topRef: false,
    expose: 'none',
    strictTuples: true,
  };

  const generator = tsj.createGenerator(config);

  const schema = generator.createSchema(config.type);

  const properties = schema.properties! as unknown as Config.All;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (properties['qcfg.tasks'] as any).scope = 'resource';

  const pkg: ExtensionJSON.Manifest = {
    contributes: {
      configuration: {
        properties: schema.properties!,
      },
    },
  };

  return pkg;
}
