'use strict';

import { ExtensionContext } from "vscode";
import { Modules } from '../module';
import { ConfigFilePair, watchConfigFile } from "../config";
import { log } from "../logging";

const CONFIG_FILE = 'vscode-qcfg.tasks.json';

function loadConfig(filePair: ConfigFilePair) {
  const files: string[] = [];
  if (filePair.global)
    files.push(filePair.global);
  if (filePair.workspace)
    files.push(filePair.workspace);
  if (files.isEmpty)
    log.info('No tasks config files found');
  else
    log.info(`Loading tasks from ${files}`);
}

function activate(context: ExtensionContext) {
  const {configFilePair, disposable} = watchConfigFile(CONFIG_FILE, loadConfig);
  loadConfig(configFilePair);
  context.subscriptions.push(disposable);
}

Modules.register(activate);