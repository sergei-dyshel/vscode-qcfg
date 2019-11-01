'use strict';

import { ExtensionContext, TextDocument, workspace, Uri } from "vscode";
import { Modules } from './module';
import { listenWrapped } from "./exception";
import { Dictionary } from "typescript-collections";
import { log } from "./logging";

// Private

const openDocuments = new Dictionary<Uri, TextDocument>();

function filterUri(uri: Uri)
{
  const SCHEMES = ['git', 'output'];
  if (SCHEMES.includes(uri.scheme))
    return true;
  return false;
}

function onDidOpenTextDocument(document: TextDocument) {
  if (filterUri(document.uri))
    return;
  log.debug('Opened text document ', document);
  if (openDocuments.containsKey(document.uri)) {
    log.warn('Opened duplicate text document', document);
  }
  openDocuments.setValue(document.uri, document);
}

function onDidCloseTextDocument(document: TextDocument)
{
  if (filterUri(document.uri))
    return;
  log.debug('Closed text document ', document);
  openDocuments.remove(document.uri);
}


function activate(context: ExtensionContext) {
  context.subscriptions.push(
      listenWrapped(workspace.onDidOpenTextDocument, onDidOpenTextDocument),
      listenWrapped(workspace.onDidCloseTextDocument, onDidCloseTextDocument));
}

Modules.register(activate);
