/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

//@ts-check

'use strict';

import path from 'path';
import webpack from 'webpack';

const generateConfig = (env): webpack.configuration => ({
  target: 'node',  // vscode extensions run in a Node.js-context 📖 ->
                   // https://webpack.js.org/configuration/node/

  entry:
      './src/extension.ts',  // the entry point of this extension, 📖 ->
                             // https://webpack.js.org/configuration/entry-context/
  output: {
    // the bundle is stored in the 'dist' folder (check package.json), 📖 ->
    // https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]',
  },
  devtool: 'source-map',
  optimization: {
    minimize: false,
  },
  externals: {
    vscode:
        'commonjs vscode'  // the vscode-module is created on-the-fly and must
                           // be excluded. Add other modules that cannot be
                           // webpack'ed, 📖 ->
                           // https://webpack.js.org/configuration/externals/
  },
  resolve: {
    // support reading TypeScript and JavaScript files, 📖 ->
    // https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js', '.node']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                module: 'es6',  // override `tsconfig.json` so that TypeScript
                                // emits native JavaScript modules.
                noUnusedLocals: false
              }
            }
          },
          {loader: 'ifdef-loader', options: {DEBUG: env && env.DEBUG}}
        ]
      },
      {test: /\.node$/, use: 'node-loader'}
    ]
  },
  stats: {
    all: false,
    errors: true,
    warnings: true,
    warningsFilter: (warning) => {
      return (
          warning.includes("Can't resolve 'spawn-sync'") ||
          warning.includes("build/Debug"));
    }
  }
});

module.exports = (env) => {
    return generateConfig(env);
};