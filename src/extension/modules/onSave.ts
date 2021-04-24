import { TextDocument, ExtensionContext, workspace } from 'vscode';
import { Modules } from './module';

export function registerOnSave(cb: Callback) {
  callbacks.push(cb);
}

// Private

type Callback = (document: TextDocument) => Promise<void> | void;

const callbacks: Callback[] = [];

function onDidSaveTextDocument(document: TextDocument) {}

async function runCallbacks(document: TextDocument) {}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    workspace.onDidSaveTextDocument(onDidSaveTextDocument),
  );
}

Modules.register(activate);
