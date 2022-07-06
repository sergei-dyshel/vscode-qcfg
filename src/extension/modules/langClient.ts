import type { ExtensionContext, Position, Range, TextDocument } from 'vscode';
import { commands, extensions, languages, Location, Uri } from 'vscode';
import * as client from 'vscode-languageclient';
import { assert, assertNotNull, check } from '../../library/exception';
import { log, Logger } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { diffArrays } from '../../library/tsUtils';
import {
  Ccls,
  CclsCallHierarchyProvider,
  CclsTypeHierarchyProvider,
} from '../utils/ccls';
import type { Clangd } from '../utils/clangd';
import { ClangdTypeHierarchyProvider } from '../utils/clangd';
import { ConditionalResource } from '../utils/disposable';
import {
  c2pConverter,
  c2pTextDocument,
  c2pTextDocumentPosition,
  p2cAnyLocations,
  p2cConverter,
} from '../utils/langClientConv';
import { mapAsync } from './async';
import { selectMultiple } from './dialog';
import { registerAsyncCommandWrapped } from './exception';
import type { LocationGroup } from './locationTree';
import { setPanelLocationGroups } from './locationTree';
import { Modules } from './module';
import { searchWithCommand } from './search';
import { getActiveTextEditor } from './utils';

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
  languageClient: () => client.LanguageClient;
  isRunning: () => boolean;
}

class LanguageClientWrapper {
  private readonly log: Logger;

  constructor(public name: string, readonly extentsionId: string) {
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

  get client(): client.LanguageClient | undefined {
    const extension = this.extension;
    if (!extension) return undefined;
    if (!extension.isActive) return undefined;
    const exports = extension.exports;
    if (!exports.isRunning()) return undefined;
    return exports.languageClient();
  }

  sendDidSave(document: TextDocument) {
    if (!this.client) return;
    const params: client.DidSaveTextDocumentParams = {
      textDocument: {
        uri: c2pConverter.asUri(document.uri),
        version: null,
      },
    };

    this.client.sendNotification(
      client.DidSaveTextDocumentNotification.method,
      params,
    );
    this.log.debug('Sent didSave', document);
  }

  async getReferences(
    uri: Uri,
    pos: Position,
    extra?: object,
  ): Promise<Location[]> {
    return (
      (await this.client?.sendRequest(client.ReferencesRequest.type, {
        context: {
          includeDeclaration: false,
        },
        ...c2pTextDocumentPosition(uri, pos),
        ...extra,
      })) ?? []
    ).map((loc) => p2cConverter.asLocation(loc));
  }

  async getDefinitions(uri: Uri, pos: Position): Promise<Location[]> {
    const rsp =
      (await this.client?.sendRequest(
        client.DefinitionRequest.type,
        c2pTextDocumentPosition(uri, pos),
      )) ?? [];
    return p2cAnyLocations(rsp);
  }

  async getDeclarations(uri: Uri, pos: Position): Promise<Location[]> {
    const rsp =
      (await this.client?.sendRequest(
        client.DeclarationRequest.type,
        c2pTextDocumentPosition(uri, pos),
      )) ?? [];
    return p2cAnyLocations(rsp);
  }

  async getImplementations(uri: Uri, pos: Position): Promise<Location[]> {
    const rsp =
      (await this.client?.sendRequest(
        client.ImplementationRequest.type,
        c2pTextDocumentPosition(uri, pos),
      )) ?? [];
    return p2cAnyLocations(rsp);
  }

  // XXX: currently unused
  async getDocumentSymbols(uri: Uri) {
    const rsp = await this.client?.sendRequest(
      client.DocumentSymbolRequest.type,
      {
        textDocument: c2pTextDocument(uri),
      },
    );
    if (!rsp) return;
    return rsp.map((sym) => {
      assert(
        'range' in sym,
        'Document symbol provider returned SymbolInformation',
      );
      return p2cConverter.asDocumentSymbol(sym);
    });
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

  async searchAssignments(uri: Uri, position: Position) {
    return this.getReferences(uri, position, { role: Ccls.RefRole.ASSIGNMENT });
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

  async getAST(uri: Uri, range: Range) {
    return this.client?.sendRequest<Clangd.ASTNode>('textDocument/ast', {
      textDocument: c2pTextDocument(uri),
      range: c2pConverter.asRange(range),
    });
  }
}

export const cclsWrapper = new CclsWrapper();
export const clangdWrapper = new ClangdWrapper();

const ALL_CLIENTS = [cclsWrapper, clangdWrapper];

async function refreshLangClients() {
  return mapAsync(ALL_CLIENTS, async (wrapper) => wrapper.refreshOrRestart());
}

async function restartLangClients() {
  return mapAsync(ALL_CLIENTS, async (wrapper) => wrapper.restart());
}

async function stopLangClients() {
  return mapAsync(ALL_CLIENTS, async (wrapper) => wrapper.stop());
}

async function compareOnType(
  name: string,
  getter: (
    wrapper: LanguageClientWrapper,
    uri: Uri,
    pos: Position,
  ) => Promise<Location[]>,
): Promise<LocationGroup[]> {
  const editor = getActiveTextEditor();
  const uri = editor.document.uri;
  const pos = editor.selection.active;

  const wrlocs: Location[][] = [];
  for (const wrapper of ALL_CLIENTS) {
    assertNotNull(wrapper.client, `${wrapper.name} not running`);

    const locs = await getter(wrapper, uri, pos);
    // some lang servers don't automatically resolve symlinks
    for (const loc of locs)
      loc.uri = Uri.file(nodejs.fs.realpathSync.native(loc.uri.fsPath));
    locs.sort(Location.compare);
    locs.uniq(Location.equal);
    wrlocs.push(
      locs.filter(
        (loc) =>
          !(
            loc.uri.equals(uri) &&
            loc.range.start.line === loc.range.end.line &&
            loc.range.start.line === pos.line
          ),
      ),
    );
  }

  const groups: LocationGroup[] = [];

  const [only0, only1, common] = diffArrays(
    wrlocs[0],
    wrlocs[1],
    Location.equal,
  );

  if (!only0.isEmpty) {
    groups.push([`${name} only in ${ALL_CLIENTS[0].name}`, only0]);
    // log.info(`${name} only in ${ALL_CLIENTS[0].name}:`);
    // for (const loc of only0)
    //   log.info(
    //     `${loc.uri.fsPath}:${loc.range.start.line + 1}:${
    //       loc.range.start.character + 1
    //     }-${loc.range.end.line}:${loc.range.end.character + 1}`,
    //   );
  }

  if (!only1.isEmpty) {
    groups.push([`${name} only in ${ALL_CLIENTS[1].name}`, only1]);
    /*     log.info(`${name} only in ${ALL_CLIENTS[1].name}:`);
    for (const loc of only1)
      log.info(
        `${loc.uri.fsPath}:${loc.range.start.line + 1}:${
          loc.range.start.character + 1
        }-${loc.range.end.line + 1}:${loc.range.end.character + 1}`,
      );
     */
  }

  if (!common.isEmpty) {
    groups.push([`${name} in common`, common]);
  }

  // if (!only0.isEmpty || !only1.isEmpty) executeCommandHandled('qcfg.log.show');
  return groups;
}

async function compareLangClients() {
  const groups: LocationGroup[] = [];

  groups.push(
    ...(await compareOnType('Definitions', async (wrapper, uri, pos) =>
      wrapper.getDefinitions(uri, pos),
    )),
  );

  groups.push(
    ...(await compareOnType('Declarations', async (wrapper, uri, pos) =>
      wrapper.getDeclarations(uri, pos),
    )),
  );

  groups.push(
    ...(await compareOnType('Implementations', async (wrapper, uri, pos) =>
      wrapper.getImplementations(uri, pos),
    )),
  );

  groups.push(
    ...(await compareOnType('References', async (wrapper, uri, pos) =>
      wrapper.getReferences(uri, pos),
    )),
  );

  await setPanelLocationGroups('Language client result diff', groups);
}

async function clangdShowAST() {
  const edit = getActiveTextEditor();
  const ast = await clangdWrapper.getAST(edit.document.uri, edit.selection);
  log.info(
    JSON.stringify(
      ast,
      ['arcana', 'kind', 'role', 'detail', 'children'],
      '  ' /* space*/,
    ),
  );
  console.log(ast);
}

async function cclsSearchSpecificRefs(uri: Uri, position: Position) {
  const BASE_TYPES = 'base types';
  const selected = await selectMultiple(
    [BASE_TYPES, ...Ccls.allRefRoles],
    (label) => ({ label }),
    'cclsRefs',
    (label) => label,
    {
      title: 'Select types of references to search',
    },
  );
  check(selected !== undefined, 'Canceled ccls ref search');
  const base = selected.includes(BASE_TYPES);
  let role = 0;
  for (const roleStr of selected) {
    if (roleStr === BASE_TYPES) continue;
    role |= Ccls.refRoleFromString(roleStr);
  }
  return cclsWrapper.getReferences(uri, position, { base, role });
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.langClient.restart', restartLangClients),
    registerAsyncCommandWrapped('qcfg.langClient.refresh', refreshLangClients),
    registerAsyncCommandWrapped('qcfg.langClient.stop', stopLangClients),
    registerAsyncCommandWrapped('qcfg.langClient.compare', compareLangClients),
    registerAsyncCommandWrapped('qcfg.clangd.dumpAST', clangdShowAST),
    registerAsyncCommandWrapped('qcfg.ccls.assignments', async () =>
      searchWithCommand(
        'Assignments',
        cclsWrapper.searchAssignments.bind(cclsWrapper),
      ),
    ),
    registerAsyncCommandWrapped('qcfg.ccls.specificRefs', async () =>
      searchWithCommand('Ccls specific refs', cclsSearchSpecificRefs),
    ),

    new ConditionalResource(
      'ClangdTypeHierarchy',
      () =>
        languages.registerTypeHierarchyProvider(
          ['c', 'cpp'],
          new ClangdTypeHierarchyProvider(() => clangdWrapper.client),
        ),
      {
        extensionId: clangdWrapper.extentsionId,
        configSection: 'qcfg.clangd.typeHierarchy',
      },
    ),
    new ConditionalResource(
      'CclsTypeHierarchy',
      () =>
        languages.registerTypeHierarchyProvider(
          ['c', 'cpp'],
          new CclsTypeHierarchyProvider(() => cclsWrapper.client),
        ),
      {
        extensionId: cclsWrapper.extentsionId,
        configSection: 'qcfg.ccls.typeHierarchy',
      },
    ),
    new ConditionalResource(
      'CclsCallHierarchy',
      () =>
        languages.registerCallHierarchyProvider(
          ['c', 'cpp'],
          new CclsCallHierarchyProvider(() => cclsWrapper.client),
        ),
      {
        extensionId: cclsWrapper.extentsionId,
        configSection: 'qcfg.ccls.callHierarchy',
      },
    ),
  );
}

Modules.register(activate);
