import type { ExtensionContext } from 'vscode';
import { commands, window } from 'vscode';
import type { ExtensionJSON } from '../../library/extensionManifest';
import { readFile } from '../../library/filesystemNodejs';
import {
  chokidar,
  globSync,
  isDirectorySync,
  statAsync,
} from '../../library/fileUtils';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { dirName } from '../../library/pathUtils';
import { discardReturn } from '../../library/templateTypes';
import { extensionContext } from '../utils/extensionContext';
import { mapAsync } from './async';
import {
  handleAsyncStd,
  handleErrors,
  registerCommandWrapped,
} from './exception';
import { Modules } from './module';

async function getExtensionVersion(extensionPath: string) {
  const jsonPath = nodejs.path.join(extensionPath, 'package.json');
  const jsonText = await readFile(jsonPath);
  const json = JSON.parse(jsonText.toString()) as ExtensionJSON.Manifest;
  const stat = await statAsync(jsonPath);
  return [json.version!, stat.ctime] as const;
}

const GRACE_TIME_MS = 10 * 1000; // 10 seconds

let timeout: NodeJS.Timeout | undefined;
let initialVersion: string;
let initialCtime: Date;

async function check() {
  timeout = undefined;
  const extensionId = extensionContext().extension.id.toLowerCase();
  const extensionsRoot = dirName(extensionContext().extensionPath);
  const globPat = nodejs.path.join(extensionsRoot, extensionId + '-*');
  const extensionDirs = globSync(globPat).filter(isDirectorySync);
  let versions: Array<readonly [string, Date]>;
  try {
    versions = await mapAsync(extensionDirs, getExtensionVersion);
  } catch (err) {
    log.warn(`Error while getting extension versions: ${err}`);
    return;
  }
  versions.sortByKey((ver) => ver[1]);
  if (versions.isEmpty) {
    log.info(
      `No installed extension versions in ${extensionsRoot}, probably running in debug`,
    );
    return;
  }
  const [version, ctime] = versions.top!;
  if (ctime <= initialCtime) return;
  const answer = await window.showWarningMessage(
    `Qcfg extension version changed (${initialVersion} -> ${version}). Reload window?`,
    'YES',
    'NO',
  );
  if (answer === 'YES')
    return commands
      .executeCommand('workbench.action.reloadWindow')
      .ignoreResult();
}

async function run() {
  [initialVersion, initialCtime] = await getExtensionVersion(
    extensionContext().extensionPath,
  );
  log.info(
    `Current qcfg version ${initialVersion}, installed ${initialCtime.toISOString()}`,
  );

  const watcher = new chokidar.FSWatcher({ depth: 1, persistent: true });
  watcher.add(dirName(extensionContext().extensionPath));
  watcher.on('all', () => {
    if (timeout) return;
    log.info('Detected change in extensions directory');
    timeout = setTimeout(discardReturn(handleErrors(check)), GRACE_TIME_MS);
  });
}

function activate(context: ExtensionContext) {
  handleAsyncStd(run());
  context.subscriptions.push(
    registerCommandWrapped('qcfg.extension.checkUpdate', check),
  );
}

Modules.register(activate);
