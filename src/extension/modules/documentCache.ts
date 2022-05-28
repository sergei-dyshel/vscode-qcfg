'use strict';

import { Dictionary } from 'typescript-collections';
import type { ExtensionContext, TextDocument, Uri } from 'vscode';
import { workspace } from 'vscode';
import { log } from '../../library/logging';
import { listenWrapped } from './exception';
import { Modules } from './module';

export function registerDocumentUriDict<V>(dict: Dictionary<Uri, V>) {
  uriDicts.push(dict as Dictionary<Uri, unknown>);
}

// Private

const openDocuments = new Dictionary<Uri, TextDocument>();

const uriDicts: Array<Dictionary<Uri, unknown>> = [];

function filterUri(uri: Uri) {
  const SCHEMES = ['git', 'gitfs', 'output', 'vscode'];
  if (SCHEMES.includes(uri.scheme)) return true;
  return false;
}

function onDidOpenTextDocument(document: TextDocument) {
  if (filterUri(document.uri)) return;
  log.debug('Opened text document ', document);
  if (openDocuments.containsKey(document.uri)) {
    log.warn('Opened duplicate text document', document);
  }
  openDocuments.setValue(document.uri, document);
}

function onDidCloseTextDocument(document: TextDocument) {
  if (filterUri(document.uri)) return;
  log.debug('Closed text document ', document);
  openDocuments.remove(document.uri);
  for (const map of uriDicts) map.remove(document.uri);
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    listenWrapped(workspace.onDidOpenTextDocument, onDidOpenTextDocument),
    listenWrapped(workspace.onDidCloseTextDocument, onDidCloseTextDocument),
  );
}

Modules.register(activate);
