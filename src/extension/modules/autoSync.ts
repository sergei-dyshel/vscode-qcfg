import type { ExtensionContext, StatusBarItem } from "vscode";
import { window } from "vscode";
import { log } from "../../library/logging";
import * as nodejs from "../../library/nodejs";
import { setTimeoutPromise } from "../../library/nodeUtils";
import { getConfiguration } from "../utils/configuration";
import { setStatusBarErrorBackground } from "../utils/statusBar";
import { ConfigSectionWatcher } from "./configWatcher";
import { registerSyncCommandWrapped } from "./exception";
import { sendDidSaveToLangClients } from "./langClient";
import { Modules } from "./module";
import * as saveAll from "./saveAll";
import * as subprocess from "./subprocess";

enum State {
  OFF,
  ON,
  ERROR,
}

let state = State.OFF;

let status: StatusBarItem;

function setStatusBar() {
  let stateStr = "";
  switch (state) {
    case State.ON:
      stateStr = "on";
      status.color = "yellow";
      break;
    case State.OFF:
      stateStr = "off";
      status.color = undefined;
      break;
    case State.ERROR:
      stateStr = "error";
      status.color = "red";
      break;
  }
  status.text = "AutoSync: " + stateStr;
  status.backgroundColor = undefined;
  status.show();
}

function toggle() {
  state = state === State.OFF ? State.ON : State.OFF;
  setStatusBar();
}

async function onSaveAll(docs: saveAll.DocumentsInFolder) {
  if (state === State.OFF) return;

  const command = getConfiguration().get("qcfg.autoSync.command");

  if (!command) return;

  const folder = docs.folder.uri.fsPath;

  const docPaths = docs.documents.map((doc) =>
    nodejs.path.relative(folder, doc.fileName),
  );
  log.debug(
    `Auto syncing ${docPaths} in ${docs.folder.name} (under ${folder})`,
  );

  const paths = docPaths.join(" ");
  const cmd = command.includes("{}")
    ? command.replace("{}", paths)
    : `${command} ${paths}`;
  log.debug("Running ", cmd);
  try {
    setStatusBarErrorBackground(status);
    status.text += " (syncing)";
    await subprocess.executeSubprocess(cmd, { cwd: folder });
    if (state === State.ERROR) {
      state = State.ON;
    }
  } catch (err: unknown) {
    const error = err as subprocess.ExecResult;
    if (state !== State.ERROR) {
      await window.showErrorMessage(
        `autoSync failed with ${error.code}, ${error.signal} stdout: ${error.stdout} stderr: ${error.stderr}`,
      );
      state = State.ERROR;
    }
    return;
  } finally {
    setStatusBar();
  }
  if (getConfiguration().get("qcfg.langClient.remote")) {
    log.debug("Waiting before sending didSave to clients");
    await setTimeoutPromise(500);
    for (const doc of docs.documents) sendDidSaveToLangClients(doc);
  }
}

const enabled = new ConfigSectionWatcher("qcfg.autoSync.enabled", () => {
  state = enabled.value ? State.ON : State.OFF;
  setStatusBar();
});

function activate(context: ExtensionContext) {
  status = window.createStatusBarItem();
  status.command = "qcfg.autoSync.toggle";

  context.subscriptions.push(
    enabled.register(),
    registerSyncCommandWrapped("qcfg.autoSync.toggle", toggle),
    saveAll.onEvent(onSaveAll),
  );
}

Modules.register(activate);
