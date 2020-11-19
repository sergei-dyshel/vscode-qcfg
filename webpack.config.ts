/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable import/no-extraneous-dependencies */
// @ts-check

'use strict';

import path from 'path';
import type webpack from 'webpack';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const generateConfig = (env: any): webpack.Configuration => ({
  target: 'node', // vscode extensions run in a Node.js-context 📖 ->
  // https://webpack.js.org/configuration/node/
  context: __dirname,
  entry: {
    extension: './src/extension/extension.ts',
    remoteCli: './src/tools/remoteCli.ts',
  },
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 ->
    // https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'source-map',
  optimization: {
    minimize: false,
    mangleExports: false,
    concatenateModules: false,
    chunkIds: 'named',
    moduleIds: 'named',
    removeAvailableModules: false,
    removeEmptyChunks: false,
    flagIncludedChunks: false,
    providedExports: false,
    // this one is needed, otherwise bundle can't be loaded because of resolving nodejs
    usedExports: false,
  },
  externals: [
    {
      vscode: 'commonjs vscode', // the vscode-module is created on-the-fly and must

      // be excluded. Add other modules that cannot be
      // webpack'ed, 📖 ->
      // https://webpack.js.org/configuration/externals/
    },
    /Debug\/iconv\.node/,
    // add native modules which cause trouble with webpack
    'node-window-manager',
  ],
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 ->
    // https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js', '.node'],
  },
  module: {
    // becaues of `typescript-collections`
    noParse: /.*umd\.js/,

    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'es6', // override `tsconfig.json` so that TypeScript
                // emits native JavaScript modules.
                noUnusedLocals: false,
              },
            },
          },
          { loader: 'ifdef-loader', options: { DEBUG: env?.DEBUG } },
        ],
      },
      { test: /\.node$/, use: 'node-loader', exclude: '/Debug/iconv.node' },
    ],
  },
  ignoreWarnings: [
    {
      message: /Can't resolve 'spawn-sync'/,
    },
    {
      message: /build\/Debug/,
    },
    {
      message: /the request of a dependency is an expression/,
    },
  ],
  stats: {
    all: false,
    errors: true,
    warnings: true,
  },
});

module.exports = (env: unknown) => generateConfig(env);
