import type { ExtensionContext, TextDocument } from 'vscode';
import { commands, extensions } from 'vscode';
import type {
  DidSaveTextDocumentParams,
  LanguageClient,
} from 'vscode-languageclient';
import { log, Logger } from '../../library/logging';
import { mapAsync } from './async';
import { registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';

export function isAnyLangClientRunning(): boolean {
  return ALL_CLIENTS.map((wrapper) => wrapper.isClientRunning).isAnyTrue();
}

export async function refreshOrRestartLangClients() {
  return mapAsync(ALL_CLIENTS, async (wrapper) => wrapper.refreshOrRestart());
}

export function sendDidSaveToLangClients(document: TextDocument) {
  for (const wrapper of ALL_CLIENTS) wrapper.sendDidSave(document);
}

interface LanguageClientAPI {
  languageClient: () => LanguageClient;
  isRunning: () => boolean;
}

class LanguageClientWrapper {
  private readonly log: Logger;

  constructor(name: string, private readonly extentsionId: string) {
    this.log = new Logger({
      name: 'LanguageClient',
      instance: name,
      parent: log,
    });
  }

  protected get extension() {
    return extensions.getExtension<LanguageClientAPI>(this.extentsionId);
  }

  protected get isExtensionActive() {
    return this.extension?.isActive;
  }

  get isClientRunning() {
    const extension = this.extension;
    if (!extension) return false;
    if (!extension.isActive) return false;
    const exports = extension.exports;
    return exports.isRunning();
  }

  get client(): LanguageClient | undefined {
    const extension = this.extension;
    if (!extension) return undefined;
    if (!extension.isActive) return undefined;
    const exports = extension.exports;
    if (!exports.isRunning()) return undefined;
    return exports.languageClient();
  }

  sendDidSave(document: TextDocument) {
    const client = this.client;
    if (!client) return;
    const params: DidSaveTextDocumentParams = {
      textDocument: {
        uri: document.uri.toString(),
        version: null,
      },
    };

    client.sendNotification('textDocument/didSave', params);
    this.log.debug('Sent didSave', document);
  }

  async restart() {
    if (this.isExtensionActive) return this.runRestartCmd();
  }

  async refresh() {
    if (this.isClientRunning) return this.runRefreshCmd();
  }

  async refreshOrRestart() {
    if (this.isClientRunning) return this.runRefreshCmd();
    if (this.isExtensionActive) return this.runRestartCmd();
  }

  async stop() {
    if (this.isClientRunning) return this.client!.stop();
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function, class-methods-use-this
  protected async runRefreshCmd(): Promise<void> {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function, class-methods-use-this
  protected async runRestartCmd(): Promise<void> {}
}

class CclsWrapper extends LanguageClientWrapper {
  constructor() {
    super('ccls', 'ccls-project.ccls-qcfg');
  }

  // eslint-disable-next-line class-methods-use-this
  override async runRefreshCmd() {
    return commands.executeCommand('ccls.reload').ignoreResult();
  }

  // eslint-disable-next-line class-methods-use-this
  override async runRestartCmd() {
    return commands.executeCommand('ccls.restart').ignoreResult();
  }
}

class ClangdWrapper extends LanguageClientWrapper {
  constructor() {
    super('clangd', 'llvm-vs-code-extensions.vscode-clangd-qcfg');
  }

  override async refreshOrRestart() {
    return this.restart();
  }

  // eslint-disable-next-line class-methods-use-this
  override async runRestartCmd() {
    return commands.executeCommand('clangd.restart').ignoreResult();
  }
}

const ALL_CLIENTS = [new CclsWrapper(), new ClangdWrapper()];

async function refreshLangClients() {
  return mapAsync(ALL_CLIENTS, async (wrapper) => wrapper.refreshOrRestart());
}

async function restartLangClients() {
  return mapAsync(ALL_CLIENTS, async (wrapper) => wrapper.restart());
}

async function stopLangClients() {
  return mapAsync(ALL_CLIENTS, async (wrapper) => wrapper.stop());
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.langClient.restart', restartLangClients),
    registerAsyncCommandWrapped('qcfg.langClient.refresh', refreshLangClients),
    registerAsyncCommandWrapped('qcfg.langClient.stop', stopLangClients),
  );
}

Modules.register(activate);
