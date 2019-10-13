'use strict';

import * as vscode from 'vscode';
import * as fileUtils from './fileUtils';
import * as saveAll from './saveAll';
import { log, Logger } from './logging';
import * as subprocess from './subprocess';
import {PromiseQueue} from './async';

import * as path from 'path';
import * as child_process from 'child_process';
import * as readline from 'readline';
import {isLspActive} from './language';
import {getActiveTextEditor} from './utils';
import {parseNumber, buildFuzzyPattern, splitWithRemainder, buildAbbrevPattern} from './stringUtils';
const RE2 = require('re2');
import { registerCommandWrapped, handleErrors } from './exception';
import { Modules } from './module';

async function findGtagsDir(dir: string) {
  while (true) {
    if (await fileUtils.exists(path.join(dir, 'GTAGS'))) {
      return dir;
    } else if (dir === '/') {
      return undefined;
    } else {
      dir = path.dirname(dir);
    }
  }
}

async function onSaveAll(docs: saveAll.DocumentsInFolder) {
  const gtagsDir = await findGtagsDir(docs.folder.uri.fsPath);
  if (!gtagsDir) {
    log.debug(`No GTAGS in ${docs.folder.name}`);
    return;
  } else {
    log.debug(`Found GTAGS in ${gtagsDir}`);
  }

  const docPaths = docs.documents.map(
      (doc) => path.relative(gtagsDir, doc.uri.fsPath));

  log.info(`Gtags on ${docPaths} in "${docs.folder.name}"`);
  const cmd = 'gtags-update.sh ' + docPaths.join(' ');
  try {
    await subprocess.executeSubprocess(cmd, {cwd: gtagsDir});
  } catch (err) {
    vscode.window.showErrorMessage('gtags update failed');
  }
}

async function updateDB() {
  for (const folder of (vscode.workspace.workspaceFolders || [])) {
    const path = folder.uri.fsPath;
    const gtagsDir = await findGtagsDir(path);

    if (!gtagsDir)
      continue;
    try {
      const res = await subprocess.executeSubprocess('q-gtags -c', {
        cwd: gtagsDir,
        allowedCodes: [0, 2],
        statusBarMessage: 'gtags check'
      });
      if (res.code === 2)
        vscode.window.showInformationMessage('gtags db regenerated');
    } catch (err) {
      vscode.window.showErrorMessage(
          `gtags db check failed: ${(err as Error).message}`);
    }
  }
}

const rootLogger = log;

namespace WorkspaceGtags {
  const LIMIT = 1000;
  let quickPick: vscode.QuickPick<Item> | undefined;
  let searchProcess: child_process.ChildProcess | undefined;
  let reader: readline.ReadLine;
  let gtagsDir: string;
  let searchResults: Item[];
  let searchedQuery: string;
  let currentQeury: string;
  let currentItems: Item[];
  let limitReached = false;
  const log = new Logger({name: 'workspaceGtags', parent: rootLogger});
  let re2pattern: any;

  export async function run() {
    const editor = getActiveTextEditor();
    gtagsDir = log.assertNonNull(await findGtagsDir(editor.document.fileName));
    quickPick = vscode.window.createQuickPick();
    quickPick.onDidHide(handleErrors(onHide));
    quickPick.onDidAccept(handleErrors(abortSearch));
    quickPick.onDidChangeValue(handleErrors(onNewQuery));
    quickPick.onDidAccept(handleErrors(onDidAccept));
    quickPick.show();
    onNewQuery('');
  }

  function onHide() {
    abortSearch();
    quickPick!.dispose();
    quickPick = undefined;
  }

  function updateItems() {
    quickPick!.items = currentItems;
  }

  function onDidAccept() {
    const selected = quickPick!.selectedItems[0];
    const absPath = path.join(gtagsDir, selected.file);
    fileUtils.openTagLocation(absPath, {line: selected.line, tag: selected.name});
    abortSearch();
    quickPick!.dispose();
    quickPick = undefined;
  }

  function onNewQuery(query: string) {
    log.debug(`New query: "${query}"`);
    currentQeury = query;
    re2pattern = new RE2(buildFuzzyPattern(query), "i");
    if (query.startsWith(searchedQuery) && !limitReached) {
      currentItems =
          searchResults.filter((item) => re2pattern.test(item.label));
      log.debug(
          `Reused results from previous query "${searchedQuery}", filtered ${
              currentItems.length} out of ${searchResults.length} items`);
      updateItems();
      return;
    }
    abortSearch();
    startSearch(query);
  }

  function abortSearch() {
    if (searchProcess) {
      log.debug('Aborting search');
      reader.close();
      searchProcess.stdout.destroy();
      searchProcess.kill();
    }
    searchProcess = undefined;
    searchResults = [];
  }

  interface Item extends vscode.QuickPickItem, TagInfo {}

  function startSearch(query: string) {
    searchedQuery = query;
    searchResults = [];
    currentItems = [];
    limitReached = false;
    const spawnOptions: child_process.SpawnOptions = {cwd: gtagsDir};
    const pattern = buildFuzzyPattern(query);
    log.debug(`Searching pattern "${pattern}"`);
    searchProcess = child_process.spawn(
        'global', ['-i', '-n', '-x', '-d', pattern + '.*'], spawnOptions);
    reader = readline.createInterface(searchProcess.stdout);
    reader.on('line', onLine);
    reader.on('close', () => {
      log.debug(`Search yielded ${searchResults.length} results, ${
          currentItems.length} results are filtered`);
      if (!searchResults)
        updateItems();
    });
    searchProcess.on('exit', (code, signal) => {
      log.debug(`Search process exited with code ${code} signal ${signal}`);
      if (code || (signal && signal !== 'SIGTERM' && signal !== 'SIGPIPE')) {
        vscode.window.showErrorMessage(`gtags (pattern: ${
            pattern} exited with code ${code} signal ${signal}`);
      }
    });
  }

  function onLine(line: string) {
    if (searchResults.length === LIMIT) {
      log.debug(`Reached limit of ${LIMIT}`);
      abortSearch();
      if (currentQeury !== searchedQuery) {
        log.debug(`Restarting search with new query ${currentQeury}`);
        startSearch(currentQeury);
      } else {
        limitReached = true;
      }
      return;
    }
    const item = parse(line);
    searchResults.push(item);
    if (currentQeury === searchedQuery || re2pattern.test(item.label)) {
      currentItems.push(item);
      updateItems();
    }
  }

  function parse(line: string): Item {
    const tag  = parseLine(line);
    return {
      label: tag.name,
      description: `${path.basename(tag.file)}   ${tag.line}  ${tag.text}`,
      ...tag
    };
  }
}

interface TagInfo {
  name: string;
  line: number;
  file: string;
  text: string;
}

function tagToLocation(tag: TagInfo, gtagsDir: string): vscode.Location
{
  return new vscode.Location(
      vscode.Uri.file(path.join(gtagsDir, tag.file)),
      new vscode.Position(tag.line - 1, 0));
}

function parseLine(line: string): TagInfo {
  const parts = splitWithRemainder(line, /\s+/, 3);
  log.assert(parts.length === 4, `Cat not parse gtags line: ${line}`);
  return {
    name: parts[0],
    line: parseNumber(parts[1]),
    file: parts[2],
    text: parts[3]
  };
}


function tag2Symbol(tag: TagInfo, gtagsDir: string): vscode.SymbolInformation {
  const fullpath = vscode.Uri.file(path.join(gtagsDir, tag.file));
  const location = new vscode.Position(tag.line, 0);
  return new vscode.SymbolInformation(
      tag.name, vscode.SymbolKind.Variable, '',
      new vscode.Location(fullpath, location));
}

class GtagsGlobalSymbolsProvider implements vscode.WorkspaceSymbolProvider {
  async provideWorkspaceSymbols(query: string, token: vscode.CancellationToken):
      Promise<vscode.SymbolInformation[]> {
    const editor = getActiveTextEditor();
    switch (editor.document.languageId) {
      case 'typescript':
        return Promise.reject('Not used for typescript');
    }
    const gtagsDir =
        log.assertNonNull(await findGtagsDir(editor.document.fileName));
    const tags = await searchGtags(
        'globalSymbols', query, buildAbbrevPattern(query), gtagsDir, token);
    return tags.map(tag => tag2Symbol(tag, gtagsDir));
  }
}

async function searchGtags(
    source: string, query: string, regex: string, gtagsDir: string,
    token: vscode.CancellationToken): Promise<TagInfo[]> {
  const proc = new subprocess.Subprocess(
      `global -d -x -n "${regex}.*" | head -n100`,
      {cwd: gtagsDir, maxBuffer: 1 * 1024 * 1024});
  const log =
      new Logger({name: source, parent: rootLogger, instance: query});
  log.debug('Started');
  token.onCancellationRequested(() => {
    log.debug('Cancelled');
    proc.kill();
  });
  const result = await proc.wait();
  if (token.isCancellationRequested)
    return [];
  const lines = result.stdout.split('\n');
  const tags = lines.filter((line) => line !== '').map(parseLine);
  log.debug(`Returned ${lines.length} results`);
  return tags;
}

async function searchDefinition(query: string, gtagsDir: string): Promise<TagInfo[]> {
  const result = await subprocess.executeSubprocess(
      ['global', '-d', '-x', '-n', query], {cwd: gtagsDir});
  const lines = result.stdout.split('\n');
  const tags = lines.filter((line) => line !== '').map(parseLine);
  return tags;
}

async function openDefinition() {
  const editor = getActiveTextEditor();
  const gtagsDir = log.assertNonNull(
      await findGtagsDir(editor.document.fileName), 'GTAGS not found');
  log.assert(editor.selection.isEmpty, "Selection is not empty");
  const word = editor.document.getWordRangeAtPosition(editor.selection.active);
  const range = log.assertNonNull(word, "Not on word");
  const tag = editor.document.getText(range);
  const tags = await searchDefinition(tag, gtagsDir);
  log.assert(tags.length > 0, `No definitions found for ${tag}`);
  if (tags.length === 1) {
    const tag = tags[0];
    fileUtils.openTagLocation(
        path.join(gtagsDir, tag.file), {line: tag.line, tag: tag.name});
    return;
  }
  const locations =
      tags.map(tag => tagToLocation(tag, gtagsDir));
  vscode.commands.executeCommand(
      'editor.action.showReferences', editor.document.uri,
      editor.selection.active, locations);
}

class GtagsDefinitionProvider implements vscode.DefinitionProvider {
  async provideDefinition(
      document: vscode.TextDocument, position: vscode.Position,
      token: vscode.CancellationToken): Promise<vscode.Location[] | undefined> {
    switch (document.languageId) {
      case 'cpp':
      case 'c':
        if (isLspActive())
          return;
        break;
      case 'typescript':
        return;
    }
    const gtagsDir = log.assertNonNull(
        await findGtagsDir(document.fileName), 'GTAGS not found');
    const word =
        document.getWordRangeAtPosition(position);
    const range = log.assertNonNull(word, 'Not on word');
    const tag = document.getText(range);
    const tags = await searchGtags('definition', tag, tag, gtagsDir, token);
    return tags.map(tag => tagToLocation(tag, gtagsDir));
  }
}

class GtagsHoverProvider implements vscode.HoverProvider {
  async provideHover(
      document: vscode.TextDocument, position: vscode.Position,
      token: vscode.CancellationToken): Promise<vscode.Hover|undefined> {
    switch (document.languageId) {
      case 'cpp':
      case 'c':
        if (isLspActive())
          return;
        break;
      case 'typescript':
        return;
    }
    if (document.fileName.startsWith('extension-output'))
      return;
    const gtagsDir = log.assertNonNull(
        await findGtagsDir(document.fileName), 'GTAGS not found');
    const word =
        document.getWordRangeAtPosition(position);
    const range = log.assertNonNull(word, 'Not on word');
    const tag = document.getText(range);
    const tags = await searchGtags('hover', tag, tag, gtagsDir, token);
    if (tags.length === 0 || tags.length > 1)
      return;
    return new vscode.Hover(
        {language: document.languageId, value: tags[0].text});
  }
}
function activate(context: vscode.ExtensionContext) {
  const queue = new PromiseQueue('gtags');
  queue.add(updateDB, 'gtags check');
  setInterval(queue.queued(updateDB, 'gtags check'), 30000);
  context.subscriptions.push(
      saveAll.onEvent(queue.queued(onSaveAll)),
      vscode.languages.registerWorkspaceSymbolProvider(
          new GtagsGlobalSymbolsProvider()),
      registerCommandWrapped('qcfg.gtags.definition', openDefinition),
      vscode.languages.registerDefinitionProvider(
          '*', new GtagsDefinitionProvider()),
      vscode.languages.registerHoverProvider('*', new GtagsHoverProvider()),
      registerCommandWrapped(
          'qcfg.gtags.workspace', WorkspaceGtags.run));
}

Modules.register(activate);