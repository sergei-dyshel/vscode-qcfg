import { Modules } from './module';
import type {
  ExtensionContext,
  DiagnosticChangeEvent,
  StatusBarItem,
  TextEditor,
  ConfigurationChangeEvent,
  Uri,
  TextDocument,
} from 'vscode';
import {
  workspace,
  languages,
  window,
  StatusBarAlignment,
  DiagnosticSeverity,
} from 'vscode';
import { listenWrapped } from './exception';
import { DefaultMap, isEmptyRegExp } from '../../library/tsUtils';
import { setStatusBarBackground } from '../utils/statusBar';
import { registerDocumentUriDict } from './documentCache';
import { Dictionary } from 'typescript-collections';

let status!: StatusBarItem;
const cache = new Dictionary<
  Uri,
  { errors: number; warnings: number } | 'hidden'
>();

function onDidChangeDiagnostics(event: DiagnosticChangeEvent) {
  for (const uri of event.uris) cache.remove(uri);
  updateStatus();
}

function editorChanged(_?: TextEditor) {
  updateStatus();
}

function countDiags(document: TextDocument) {
  const config = workspace.getConfiguration('', {
    uri: document.uri,
    languageId: document.languageId,
  });
  const show = config.get<boolean>('qcfg.fileDiagnostics.show', true);
  if (!show) {
    return 'hidden';
  }
  const excludeMessage = new RegExp(
    config.get('qcfg.fileDiagnostics.excludeMessage')!,
  );
  const excludeSource = new RegExp(
    config.get('qcfg.fileDiagnostics.excludeSource')!,
  );
  const excludeCodes = config.get<Array<string | number>>(
    'qcfg.fileDiagnostics.excludeCodes',
    [],
  );

  const diags = languages.getDiagnostics(document.uri);
  const diagsBySev = new DefaultMap<DiagnosticSeverity, number>(0);
  for (const diag of diags) {
    if (!isEmptyRegExp(excludeMessage) && excludeMessage.test(diag.message))
      continue;
    if (
      !isEmptyRegExp(excludeSource) &&
      diag.source &&
      excludeSource.test(diag.source)
    )
      continue;
    if (diag.code) {
      const code =
        typeof diag.code === 'string' || typeof diag.code === 'number'
          ? diag.code
          : diag.code.value;
      if (excludeCodes.includes(code)) continue;
    }
    diagsBySev.modify(diag.severity, (n) => n + 1);
  }

  return {
    errors: diagsBySev.get(DiagnosticSeverity.Error),
    warnings: diagsBySev.get(DiagnosticSeverity.Warning),
  };
}

function updateStatus() {
  const editor = window.activeTextEditor;
  if (!editor) {
    status.hide();
    return;
  }

  if (!cache.containsKey(editor.document.uri)) {
    cache.setValue(editor.document.uri, countDiags(editor.document));
  }
  const counts = cache.getValue(editor.document.uri)!;
  if (counts === 'hidden') {
    status.hide();
    return;
  }
  const { errors, warnings } = counts;
  status.text = `file: $(error) ${errors} $(warning) ${warnings}`;
  setStatusBarBackground(
    status,
    errors > 0 ? 'error' : warnings > 0 ? 'warning' : undefined,
  );
  status.show();
}

function configChanged(event: ConfigurationChangeEvent) {
  if (event.affectsConfiguration('qcfg.fileDiagnostics')) {
    cache.clear();
    updateStatus();
  }
}

function activate(context: ExtensionContext) {
  status = window.createStatusBarItem(StatusBarAlignment.Left);
  status.command = 'workbench.action.problems.focus';
  context.subscriptions.push(
    status,
    listenWrapped(languages.onDidChangeDiagnostics, onDidChangeDiagnostics),
    listenWrapped(window.onDidChangeActiveTextEditor, editorChanged),
    listenWrapped(workspace.onDidChangeConfiguration, configChanged),
  );
  registerDocumentUriDict(cache);
  updateStatus();
}

Modules.register(activate);
