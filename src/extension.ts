'use strict';

import * as vscode from 'vscode';
import * as tasks from './tasks';
import * as editing from './editing';
import * as autoSync from './autoSync';
import * as gtags from './gtags';
import * as saveAll from './saveAll';
import * as logging from './logging';
import * as treeSitter from './treeSitter';
import * as alternate from './alternate';
import * as misc from './misc';
import * as readOnlyProject from './readOnlyProject';
import * as selectionHistory from './selectionHistory';
import * as dialog from './dialog';
import * as remoteControl from './remoteControl';
import * as assert from 'assert';

export function activate(context: vscode.ExtensionContext) {
    console.log('Extension active');
    tasks.activate(context);
    editing.activate(context);
    autoSync.activate(context);
    gtags.activate(context);
    saveAll.activate(context);
    logging.activate(context);
    treeSitter.activate(context);
    alternate.activate(context);
    misc.activate(context);
    readOnlyProject.activate(context);
    selectionHistory.activate(context);
    dialog.activate(context);
    remoteControl.activate(context);
}

// this method is called when your extension is deactivated
export function deactivate() {
}