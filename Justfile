import? '../../node_modules/@sergei-dyshel/eslint-config/export.just'
import? './node_modules/@sergei-dyshel/eslint-config/export.just'

import? '../../node_modules/@sergei-dyshel/prettier-config/export.just'
import? './node_modules/@sergei-dyshel/prettier-config/export.just'

import? '../../node_modules/@sergei-dyshel/typescript/export.just'
import? './node_modules/@sergei-dyshel/typescript/export.just'

import? '../../node_modules/@sergei-dyshel/vscode/export.just'
import? './node_modules/@sergei-dyshel/vscode/export.just'

_default:
    just --list

update-package-json-ts-node:
    node --enable-source-maps -r ts-node/register -r @sergei-dyshel/vscode/mock-register src/tools/updatePackageJson.ts

update-package-json:
    qcfg-build run --if-built --delete-if-fails --vscode-mock src/tools/updatePackageJson.ts

copy-tree-sitter-wasm:
    cp -u $(qcfg-resolve-package web-tree-sitter)/tree-sitter.wasm ./tree-sitter/

build-common: update-package-json copy-tree-sitter-wasm

build: build-common
    qcfg-build build --vscode-ext src/extension/extension.ts
    qcfg-build build src/tools/vscode-qcfg-cli.ts src/tools/syntaxDump.ts

