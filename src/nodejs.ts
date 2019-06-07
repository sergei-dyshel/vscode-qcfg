'use strict';

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as util from 'util';

export {path, fs, util};

export function activate(_: vscode.ExtensionContext) {
  // allows accessing nodejs from NodeJS console
  (console as any).nodejs = {path, fs, util};
}