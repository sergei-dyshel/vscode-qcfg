'use strict';

import type { ExtensionContext, TextDocument, Uri } from 'vscode';
import { workspace } from 'vscode';
import { Modules } from './module';
import { listenWrapped } from './exception';
import { Dictionary } from 'typescript-collections';
import { log } from '../../library/logging';

export function registerDocumentUriDict<V>(dict: Dictionary<Uri, V>) {
  uriDicts.push(dict as Dictionary<Uri, unknown>);
}

// Private

const openDocuments = new Dictionary<Uri, TextDocument>();

const uriDicts: Array<Dictionary<Uri, unknown>> = [];

function filterUri(uri: Uri) {
  const SCHEMES = ['git', 'gitfs', 'output'];
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
