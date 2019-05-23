'use strict';

import * as vscode from 'vscode';
import * as tasks from './tasks';
import * as editing from './editing';
import * as autoSync from './autoSync';
import * as gtags from './gtags';
import * as ctags from './ctags';
import * as saveAll from './saveAll';
import * as logging from './logging';
import * as treeSitter from './treeSitter';
import * as alternate from './alternate';
import * as misc from './misc';
import * as readOnlyProject from './readOnlyProject';
import * as selectionHistory from './selectionHistory';
import * as dialog from './dialog';
import * as remoteControl from './remoteControl';
import * as windowState from './windowState';
import * as search from './search';
import * as colorTheme from './colorTheme';
import * as taskRunner from './taskRunner';
import * as history from './history';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension active');
    logging.activate(context); // must be first
    tasks.activate(context);
    editing.activate(context);
    autoSync.activate(context);
    gtags.activate(context);
    ctags.activate(context);
    saveAll.activate(context);
    treeSitter.activate(context);
    alternate.activate(context);
    misc.activate(context);
    readOnlyProject.activate(context);
    selectionHistory.activate(context);
    dialog.activate(context);
    remoteControl.activate(context);
    windowState.activate(context);
    search.activate(context);
    colorTheme.activate(context);
    taskRunner.activate(context);
    history.activate(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
}