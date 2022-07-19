import * as tsj from 'ts-json-schema-generator';
import type { ExtensionJSON } from '../library/extensionManifest';
import * as nodejs from '../library/nodejs';

const [path, type, out] = nodejs.process.argv.slice(2);

const config: tsj.Config = {
  path,
  tsconfig: 'tsconfig.json',
  type,
  topRef: false,
  expose: 'none',
  strictTuples: true,
};

const generator = tsj.createGenerator(config);

const schema = generator.createSchema(config.type);

const pkg: ExtensionJSON.Manifest = {
  contributes: {
    configuration: {
      properties: schema.properties!,
    },
  },
};

const schemaStr = JSON.stringify(pkg, undefined, 4);

nodejs.fs.writeFileSync(out, schemaStr);
