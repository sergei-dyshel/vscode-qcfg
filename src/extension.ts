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

interface QcfgTaskDefinition extends vscode.TaskDefinition {
    task: string;
}

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

    const disposable = vscode.commands.registerCommand('qcfg.sayHello', () => {
        vscode.window.showInformationMessage('Hello World!');
    });
    vscode.tasks.onDidEndTask(event => {
        // console.log('Ended task: ', event.execution.task);
    });
    // vscode.workspace.onDidCloseTextDocument(event => {
    //     console.log('onDidCloseTextDocument: ' + event.fileName);
    // });
    // vscode.window.onDidChangeVisibleTextEditors(event => {
    //     console.log('onDidChangeVisibleTextEditors: ');
    // });
    context.subscriptions.push(disposable);

    // context.subscriptions.push(
    //     vscode.window.onDidChangeTextEditorSelection(event => {
    //       const editor = event.textEditor;
    //       const cursor = event.selections[0].active;
    //       console.log(`${editor.document.fileName}:${cursor.line}:${
    //           cursor.character}: changed because of ${event.kind}`);
    //     }));
}

// this method is called when your extension is deactivated
export function deactivate() {
}