import { Dictionary } from 'typescript-collections';
import type {
  DiagnosticChangeEvent,
  ExtensionContext,
  StatusBarItem,
  TextDocument,
  TextEditor,
  Uri,
} from "vscode";
import {
  DiagnosticSeverity,
  languages,
  StatusBarAlignment,
  window,
} from "vscode";
import { DefaultMap, isEmptyRegExp } from "../../library/tsUtils";
import { setStatusBarBackground } from "../utils/statusBar";
import { ConfigurationWatcher } from "./configWatcher";
import { registerDocumentUriDict } from "./documentCache";
import { listenWrapped } from "./exception";
import { Modules } from "./module";

let status!: StatusBarItem;
const cache = new Dictionary<
  Uri,
  { errors: number; warnings: number } | "hidden"
>();

const configWatcher = new ConfigurationWatcher(
  [
    "qcfg.fileDiagnostics.show",
    "qcfg.fileDiagnostics.excludeMessage",
    "qcfg.fileDiagnostics.excludeSource",
    "qcfg.fileDiagnostics.excludeCodes",
  ] as const,
  () => {
    cache.clear();
    updateStatus();
  },
);

function onDidChangeDiagnostics(event: DiagnosticChangeEvent) {
  for (const uri of event.uris) cache.remove(uri);
  updateStatus();
}

function editorChanged(_?: TextEditor) {
  updateStatus();
}

function countDiags(document: TextDocument) {
  const config = configWatcher.getConfiguration({
    uri: document.uri,
    languageId: document.languageId,
  });
  const show = config.getNotNull("qcfg.fileDiagnostics.show");
  if (!show) {
    return "hidden";
  }
  const excludeMessage = new RegExp(
    config.getNotNull("qcfg.fileDiagnostics.excludeMessage"),
  );
  const excludeSource = new RegExp(
    config.get("qcfg.fileDiagnostics.excludeSource")!,
  );
  const excludeCodes = config.get("qcfg.fileDiagnostics.excludeCodes", []);

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
        typeof diag.code === "string" || typeof diag.code === "number"
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
  if (counts === "hidden") {
    status.hide();
    return;
  }
  const { errors, warnings } = counts;
  status.text = `file: $(error) ${errors} $(warning) ${warnings}`;
  setStatusBarBackground(
    status,
    errors > 0 ? "error" : warnings > 0 ? "warning" : undefined,
  );
  status.show();
}

function activate(context: ExtensionContext) {
  status = window.createStatusBarItem(StatusBarAlignment.Left);
  status.command = "workbench.action.problems.focus";
  context.subscriptions.push(
    status,
    listenWrapped(languages.onDidChangeDiagnostics, onDidChangeDiagnostics),
    listenWrapped(window.onDidChangeActiveTextEditor, editorChanged),
    configWatcher.register(),
  );
  registerDocumentUriDict(cache);
}

Modules.register(activate);
