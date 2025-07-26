import { getActiveTextEditor } from "@sergei-dyshel/vscode";
import type {
  CodeAction,
  Diagnostic,
  ExtensionContext,
  Range,
  Selection,
  TextEdit,
  Uri,
} from "vscode";
import {
  CodeActionKind,
  commands,
  languages,
  window,
  workspace,
  WorkspaceEdit,
} from "vscode";
import {
  concatArrays,
  concatNonNullArrays,
  DefaultMap,
  mapNonNull,
} from "../../library/tsUtils";
import { GenericQuickPick } from "../utils/quickPick";
import { mapAsync } from "./async";
import { ConfigRules } from "./configRules";
import {
  handleAsyncStd,
  registerAsyncCommandWrapped,
  registerCommandWrapped,
} from "./exception";
import { Modules } from "./module";
import { showNotificationMessage } from "./notificationMessage";
import { preserveActiveLocation } from "./windowUtils";

const DEFAULT_PRIORITY = 5;

interface QuickFixAction {
  preSelected: boolean;
  action: CodeAction;
  uri: Uri;
  range: Range;
}

async function executeCodeActionProvider(
  uri: Uri,
  range: Range | Selection,
  kind?: CodeActionKind,
  itemResolveCount?: number,
): Promise<CodeAction[]> {
  // eslint-disable-next-line @typescript-eslint/non-nullable-type-assertion-style
  return commands.executeCommand<CodeAction[]>(
    "vscode.executeCodeActionProvider",
    uri,
    range,
    kind,
    itemResolveCount,
  );
}

/** Filter through config rules, sort by priority */
function filterByConfig(
  uri: Uri,
  actions: Array<{ action: CodeAction; uri: Uri; range: Range }>,
) {
  const configRules = new ConfigRules(uri);
  const rules = concatNonNullArrays(
    ...configRules.allDefined("quickFixCodeActions"),
  );

  // extract priority or apply default priority
  const fullRules = rules.map((rule) => {
    const pattern = typeof rule === "string" ? rule : rule[0];
    const priority = typeof rule === "string" ? DEFAULT_PRIORITY : rule[1];
    const regex = new RegExp(pattern);
    return { regex, priority };
  });

  // filter by matching against regexes
  const filteredActions = mapNonNull(actions, (action) => {
    for (const rule of fullRules) {
      if (rule.regex.test(action.action.title))
        return { action, priority: rule.priority };
    }
    return undefined;
  });

  // sort by range (to ensure fixes for same diagnostic stay together), then by priority
  return filteredActions
    .sorted(
      (x, y) =>
        x.action.range.compareTo(y.action.range) || x.priority - y.priority,
    )
    .map((x) => x.action);
}

/** Two workspace edits can not be applied together - ranges intersect */
function workspaceEditConflicts(wse1: WorkspaceEdit, wse2: WorkspaceEdit) {
  for (const entry1 of wse1.entries())
    for (const entry2 of wse2.entries()) {
      if (!entry1[0].equals(entry2[0])) continue;
      for (const edit1 of entry1[1])
        for (const edit2 of entry2[1]) {
          const intersection = edit1.range.intersection(edit2.range);
          if (!intersection || intersection.isEmpty) continue;
          return true;
        }
    }
  return false;
}

/** Workspace edits are equal if they apply same edits to same documents */
function workspaceEditsEqual(wse1: WorkspaceEdit, wse2: WorkspaceEdit) {
  const entries1 = wse1.entries().sort((e1, e2) => e1[0].compare(e2[0]));
  const entries2 = wse2.entries().sort((e1, e2) => e1[0].compare(e2[0]));
  return entries1.equals(
    entries2,
    (e1, e2) =>
      e1[0].equals(e2[0]) &&
      e1[1].equals(
        e2[1],
        (te1, te2) =>
          te1.range.isEqual(te2.range) && te1.newText === te2.newText,
      ),
  );
}

interface DiagnosticWithActions {
  actions: CodeAction[];
  diagnostic: Diagnostic;
}

/**
 * Get all diagnostics in file and gather code actions for all of them
 */
async function getFileCodeActions(uri: Uri): Promise<DiagnosticWithActions[]> {
  const diags = languages.getDiagnostics(uri);
  return mapAsync(diags, async (diag) => ({
    actions: await executeCodeActionProvider(uri, diag.range),
    diagnostic: diag,
  }));
}

/** Get all quickfix actions for file */
async function getFileFixes(uri: Uri) {
  const actionsByDiag = await getFileCodeActions(uri);
  // filter only quick fix type, augument with additional data
  const actions = concatArrays(
    ...actionsByDiag.map((actionRange) =>
      filterQuickFixActions(actionRange).map((action) => ({
        action,
        uri,
        range: actionRange.diagnostic.range,
      })),
    ),
  );
  // dedupe by comparing edits
  const dedupedActions = actions.uniq((act1, act2) =>
    workspaceEditsEqual(act1.action.edit!, act2.action.edit!),
  );
  // filter by regexes from config, preselect all
  const filteredActions = filterByConfig(uri, dedupedActions).map((action) => ({
    ...action,
    preSelected: true,
  }));
  // if two actions conflict deselct the second one
  for (let i = 0; i < filteredActions.length - 1; i++)
    for (let j = i + 1; j < filteredActions.length; j++) {
      const action1 = filteredActions[i];
      const action2 = filteredActions[j];
      if (!action1.preSelected || !action2.preSelected) continue;
      if (workspaceEditConflicts(action1.action.edit!, action2.action.edit!))
        action2.preSelected = false;
    }

  return filteredActions;
}

/** Filter only quickfix category */
function filterQuickFixActions(diag: DiagnosticWithActions) {
  return diag.actions.filter((action) => {
    if (!action.edit) return false;
    const kind = action.kind ?? CodeActionKind.Empty;
    return (
      kind.intersects(CodeActionKind.QuickFix) ||
      kind.intersects(CodeActionKind.SourceFixAll)
    );
  });
}

/** Extract code actions from all files in workspace */
async function getWorkspaceFixes() {
  const uris = languages.getDiagnostics().map(([uri, _]) => uri);
  return concatArrays(
    ...(await mapAsync(uris, async (uri) => getFileFixes(uri))),
  );
}

/** Select with quick pick */
async function chooseFixes(actions: QuickFixAction[], showFilenames: boolean) {
  const qp = new GenericQuickPick(
    (action) => ({
      label: action.action.title,
      description: showFilenames
        ? workspace.asRelativePath(action.uri)
        : undefined,
      picked: action.preSelected,
    }),
    actions,
  );
  qp.options.matchOnDescription = true;
  qp.options.placeholder = "Select quick fix code actions to apply";
  qp.onDidActivateItem = (action) => {
    handleAsyncStd(
      window.showTextDocument(action.uri, {
        preview: true,
        preserveFocus: true,
        selection: action.range,
      }),
    );
  };
  qp.options.canSelectMany = true;
  return qp.selectMany();
}

async function quickFixFile() {
  const document = getActiveTextEditor().document;
  const actions = await getFileFixes(document.uri);
  return chooseAndApplyFixes(actions, false /* showFilenames */);
}

async function quickFixWorkspace() {
  const actions = await getWorkspaceFixes();
  return chooseAndApplyFixes(actions, true /* showFilenames */);
}

/** Choose with quick pick and apply to workspace */
async function chooseAndApplyFixes(
  actions: QuickFixAction[],
  showFilenames: boolean,
) {
  const selected = await preserveActiveLocation(
    chooseFixes(actions, showFilenames),
  );
  if (!selected) {
    return;
  }
  const codeActions = selected.map((x) => x.action);
  await applyCodeActions(codeActions);
}

/** Apply multiple code actions as single action (undoable) */
async function applyCodeActions(actions: CodeAction[]) {
  const editsByUri = new DefaultMap<Uri, TextEdit[]>((_) => []);
  for (const action of actions)
    for (const entry of action.edit!.entries()) {
      const [uri, edits] = entry;
      editsByUri.get(uri).push(...edits);
    }
  const wsEdit = new WorkspaceEdit();
  for (const [uri, edits] of editsByUri.entries()) wsEdit.set(uri, edits);
  await workspace.applyEdit(wsEdit);
}

async function dumpFileCodeActions() {
  const editor = getActiveTextEditor();
  const actions = await getFileCodeActions(editor.document.uri);
  console.log(actions);
  showNotificationMessage("Now look in dev tools console or debug console");
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped("qcfg.codeActions.autoFixFile", quickFixFile),
    registerAsyncCommandWrapped(
      "qcfg.codeActions.autoFixWorkspace",
      quickFixWorkspace,
    ),
    registerCommandWrapped("qcfg.codeActions.dumpFile", dumpFileCodeActions),
  );
}

Modules.register(activate);
