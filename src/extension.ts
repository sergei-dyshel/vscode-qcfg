'use strict';

import * as vscode from 'vscode';
import { Modules } from './module';
import * as alternate from './alternate';
import * as autoSync from './autoSync';
import * as colorTheme from './colorTheme';
import * as ctags from './ctags';
import * as dialog from './dialog';
import * as editHistory from './editHistory';
import * as editing from './editing';
// import * as history from './history';
import * as fuzzySearch from './fuzzySearch';
import * as gtags from './gtags';
import * as language from './language';
import * as locationTree from './locationTree';
import * as logging from './logging';
import * as misc from './misc';
import * as nodejs from './nodejs';
import * as readOnlyProject from './readOnlyProject';
import * as remoteControl from './remoteControl';
import * as saveAll from './saveAll';
import * as search from './search';
import * as taskRunner from './taskRunner';
import * as treeSitter from './treeSitter';
import * as treeView from './treeView';
import * as windowState from './windowState';
import * as syntaxTreeView from './syntaxTreeView';
import * as workspaceHistory from './workspaceHistory';
import * as multipleSelection from './multipleSelection';
import * as config from './config';
import * as tasksMain from './tasks/main';
import * as liveLocation from './liveLocation';
import * as documentCache from './documentCache';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension active');

    Modules.activateAll(context);
    logging.log.info(`Activated ${logging.str(Modules.fileNames())}`);

    // history.activate(context);
    (console as any).qcfg = {
      nodejs,
      language,
      editing,
      autoSync,
      gtags,
      ctags,
      saveAll,
      treeSitter,
      alternate,
      misc,
      readOnlyProject,
      editHistory,
      dialog,
      remoteControl,
      windowState,
      search,
      colorTheme,
      taskRunner,
      fuzzySearch,
      treeView,
      locationTree,
      syntaxTreeView,
      workspaceHistory,
      multipleSelection,
      config,
      tasksMain,
      liveLocation,
      documentCache
    };
}

// this method is called when your extension is deactivated
export async function deactivate() {
  // await history.deactivate();
}
