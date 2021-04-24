import {
  ExtensionContext,
  TextDocument,
  workspace,
  WorkspaceFolder,
} from 'vscode';
import { Modules } from './module';
import { DocumentsInFolder, onSaveAllEvent } from './saveAll';
import { handleAsyncStd } from './exception';
import { runSubprocessAndWait } from './subprocess';
import { expandTemplate } from '../../library/stringUtils';
import { runTask } from './tasks/main';
import { EndAction, Reveal, TaskType } from './tasks/params';

interface Rule {
  label: string;
  glob: string;
  command: string;
}

function runRule(rule: Rule, folder: WorkspaceFolder, document: TextDocument) {
  const docPath = workspace.asRelativePath(document.uri.fsPath);
  const cmd = expandTemplate(
    rule.command,
    { file: docPath },
    true /* throw when not exsit */,
  );
  handleAsyncStd(
    runTask(
      rule.label,
      {
        type: TaskType.TERMINAL,
        reveal: Reveal.NO,
        onFailure: EndAction.NOTIFY,
        command: cmd,
      },
      {
        folder,
      },
    ),
  );
}

function onSaveAll(docs: DocumentsInFolder) {
  const rules = gatherRules(docs.folder);
  for (const document of docs.documents) {
    for (const rule of rules) {
      if (ruleMatches(rule, document)) {
        runRule(rule, docs.folder, document);
        continue;
      }
    }
  }
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(onSaveAllEvent(onSaveAll));
}

Modules.register(activate);
