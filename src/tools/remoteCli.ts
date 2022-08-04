/* eslint-disable class-methods-use-this */
import type {
  CommandLineChoiceParameter,
  CommandLineIntegerParameter,
  CommandLineStringParameter,
  ICommandLineActionOptions,
} from '@rushstack/ts-command-line';
import {
  CommandLineAction,
  CommandLineParser,
} from '@rushstack/ts-command-line';
import { abort, assert } from '../library/exception';
import { LogLevel, registerLogHandler } from '../library/logging';
import { StreamHandler } from '../library/loggingHandlers';
import * as nodejs from '../library/nodejs';
import type { IdentifiedClient } from '../library/remoteClient';
import { MultiClient } from '../library/remoteClient';
import { parseNumber } from '../library/stringUtils';

/** Logic to select server for running command */
enum Instance {
  /** Not specified, will cause exception if not overriden */
  UNDEFINED = 'undefined',
  /** Choose server with workspace folder matching provided or current folder */
  FOLDER = 'folder',
  /** Like {@linkcode FOLDER} but otherwise like {@linkcode DEFAULT} */
  FOLDER_OR_DEFAULT = 'folder_or_default',
  /** Choose default server */
  DEFAULT = 'default',
  /** Any server */
  ANY = 'any',
  /** Run on all servers */
  ALL = 'all',
}

/** Base class for all subcommands */
abstract class CliAction extends CommandLineAction {
  protected client?: IdentifiedClient;

  constructor(
    protected cli: Cli,
    private readonly options: ICommandLineActionOptions,
    private readonly opts?: {
      /** How to choose instance if not specified on command line */
      autoInstance?: Exclude<Instance, Instance.UNDEFINED>;
      /** Command can run on all instances (simultanously) */
      allAllowed?: boolean;
    },
  ) {
    super(options);
  }

  async onExecute() {
    if (this.cli.instance === Instance.UNDEFINED)
      this.cli.instance = this.opts?.autoInstance ?? Instance.UNDEFINED;
    switch (this.cli.instance) {
      case Instance.ALL:
        assert(
          this.opts?.allAllowed,
          `Can not use ${this.options.actionName} with multiple instances`,
        );
        break;
      case Instance.UNDEFINED:
        abort('Must specify instance for this command');
        break;
      default:
        this.client = this.cli.getClient(this.cli.instance);
    }
    // eslint-disable-next-line unicorn/no-useless-promise-resolve-reject
    return Promise.resolve();
  }
}

class IdentifyAction extends CliAction {
  constructor(cli: Cli) {
    super(
      cli,
      {
        actionName: 'identify',
        summary: 'Identify servers',
        documentation:
          'Query all servers and return basic information on each one',
      },
      {
        autoInstance: Instance.ALL,
        allAllowed: true,
      },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onDefineParameters() {}

  override async onExecute() {
    await super.onExecute();
    console.log(this.cli.multiClient.clients);

    if (this.client) console.log('Selected client:', this.client.info);
    else console.log('No client selected');

    const defaultClient = this.cli.multiClient.getDefault();
    if (defaultClient) console.log('Default client:', defaultClient.info);
    else console.log('No default client');
  }
}

class ReloadAction extends CliAction {
  constructor(cli: Cli) {
    super(
      cli,
      {
        actionName: 'reload',
        summary: 'Reload window',
        documentation:
          'Runs workbench.action.reloadWindow command with delay of 1 second',
      },
      {
        autoInstance: Instance.FOLDER,
        allAllowed: true,
      },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onDefineParameters() {}

  override async onExecute() {
    await super.onExecute();
    await (this.cli.instance === Instance.ALL
      ? this.cli.multiClient.sendNoResult('reloadWindow', {})
      : this.client!.sendNoResult('reloadWindow', {}));
  }
}

class CommandAction extends CliAction {
  name!: CommandLineStringParameter;

  constructor(cli: Cli) {
    super(cli, {
      actionName: 'command',
      summary: 'Run arbitrary vscode command',
      documentation: 'Excecute command by ID',
    });
  }

  onDefineParameters() {
    this.name = this.defineStringParameter({
      parameterShortName: '-n',
      parameterLongName: '--name',
      description: 'Command name',
      argumentName: 'NAME',
      required: true,
    });
  }

  override async onExecute() {
    await super.onExecute();
    await (this.cli.instance === Instance.ALL
      ? this.cli.multiClient.sendNoResult('executeCommand', {
          name: this.name.value!,
        })
      : this.client!.sendNoResult('executeCommand', {
          name: this.name.value!,
        }));
  }
}

class OpenFileAction extends CliAction {
  private fileParam!: CommandLineStringParameter;
  private lineParam!: CommandLineIntegerParameter;
  private columnParam!: CommandLineIntegerParameter;

  constructor(cli: Cli) {
    super(
      cli,
      {
        actionName: 'open',
        summary: 'Open file',
        documentation: 'Open file in given instance',
      },
      {
        autoInstance: Instance.FOLDER,
      },
    );
  }

  onDefineParameters() {
    this.fileParam = this.defineStringParameter({
      parameterLongName: '--file',
      parameterShortName: '-f',
      description:
        'File path, absolute or relative to --folder, may be in format of location FILE_NAME:LINE[:COL]',
      argumentName: 'FILE_NAME',
      required: true,
    });
    this.lineParam = this.defineIntegerParameter({
      parameterLongName: '--line',
      parameterShortName: '-l',
      description: 'Line number',
      argumentName: 'LINE',
    });
    this.columnParam = this.defineIntegerParameter({
      parameterLongName: '--column',
      parameterShortName: '-c',
      description: 'Column number',
      argumentName: 'COLUMN',
    });
  }

  override async onExecute() {
    await super.onExecute();
    const absfile = nodejs.path.resolve(this.cli.folder, this.fileParam.value!);
    assert(
      this.cli.instance !== Instance.ALL,
      'Can not open file in ALL clients',
    );
    const [path, line = undefined, col = undefined] = absfile.split(':');
    assert(nodejs.fs.existsSync(path), `File "${path}" does not exist`);
    return this.client!.send('openFile', {
      path,
      line: this.lineParam.value ?? parseNumber(line),
      column: this.columnParam.value ?? parseNumber(col),
    });
  }
}

class OpenFolderAction extends CliAction {
  private pathParam!: CommandLineStringParameter;

  constructor(cli: Cli) {
    super(
      cli,
      {
        actionName: 'open-folder',
        summary: 'Open folder',
        documentation: 'Open folder or workspace',
      },
      {
        autoInstance: Instance.ANY,
      },
    );
  }

  onDefineParameters() {
    this.pathParam = this.defineStringParameter({
      parameterLongName: '--path',
      parameterShortName: '-p',
      description: 'Folder of workspace path',
      argumentName: 'PATH',
      required: true,
    });
  }

  override async onExecute() {
    await super.onExecute();
    const absPath = nodejs.path.resolve(process.cwd(), this.pathParam.value!);
    return this.client!.send('openFolder', {
      path: absPath,
    });
  }
}

class OpenSshAction extends CliAction {
  private fileParam!: CommandLineStringParameter;

  constructor(cli: Cli) {
    super(
      cli,
      {
        actionName: 'open-ssh',
        summary: 'Open file via SSH',
        documentation: 'Open file via SSH in given instance',
      },
      {
        autoInstance: Instance.FOLDER_OR_DEFAULT,
      },
    );
  }

  onDefineParameters() {
    this.fileParam = this.defineStringParameter({
      parameterLongName: '--file',
      parameterShortName: '-f',
      description: 'File path in format HOST:PATH',
      argumentName: 'FILE_NAME',
      required: true,
    });
  }

  override async onExecute() {
    await super.onExecute();
    assert(
      this.cli.instance !== Instance.ALL,
      'Can not open file in ALL clients',
    );
    return this.client!.send('openSsh', {
      path: this.fileParam.value!,
    });
  }
}

class Cli extends CommandLineParser {
  folder!: string;
  instance!: Instance;
  multiClient!: MultiClient;

  private readonly verbose: CommandLineIntegerParameter;
  private readonly instanceParam: CommandLineChoiceParameter;
  private readonly folderParam: CommandLineStringParameter;

  constructor() {
    super({
      toolFilename: 'q-vscode-cli',
      toolDescription: 'Control vscode remotely',
    });
    this.verbose = this.defineIntegerParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      argumentName: 'LEVEL',
      description: 'Log verbosity level',
      defaultValue: 0,
    });
    this.instanceParam = this.defineChoiceParameter({
      parameterLongName: '--instance',
      parameterShortName: '-i',
      description: 'Choose instance to send command to',
      alternatives: [Instance.FOLDER, Instance.DEFAULT].map((x) =>
        x.toLowerCase(),
      ),
    });
    this.folderParam = this.defineStringParameter({
      parameterLongName: '--folder',
      parameterShortName: '-F',
      description: 'Find instance by workspace folder',
      argumentName: 'FOLDER',
    });
    this.addAction(new OpenFileAction(this));
    this.addAction(new OpenFolderAction(this));
    this.addAction(new IdentifyAction(this));
    this.addAction(new CommandAction(this));
    this.addAction(new ReloadAction(this));
    this.addAction(new OpenSshAction(this));
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  protected onDefineParameters(): void {}

  getClient(
    instance: Exclude<Instance, Instance.UNDEFINED | Instance.ALL>,
  ): IdentifiedClient {
    switch (instance) {
      case Instance.FOLDER:
        return (
          this.multiClient.findByFolder(this.folder) ??
          abort('Could not find server with workspace folder', this.folder)
        );
      case Instance.DEFAULT:
        return (
          this.multiClient.getDefault() ?? abort('No server was set as default')
        );
      case Instance.FOLDER_OR_DEFAULT:
        return (
          this.multiClient.findByFolder(this.folder) ??
          this.multiClient.getDefault() ??
          abort(
            `Could not find server with workspace folder "${this.folder}" and no server was set as default`,
          )
        );
      case Instance.ANY:
        return this.multiClient.clients[0];
    }
  }

  protected override async onExecute() {
    const handler = new StreamHandler('stderr', process.stderr);
    handler.level = LogLevel.NOTICE - this.verbose.value!;
    handler.formatOptions = { preset: 'short' };
    registerLogHandler(handler);

    this.multiClient = await MultiClient.connect();
    if (this.multiClient.clients.isEmpty) {
      throw new Error('No servers found (vscode not running');
    }

    this.instance = (this.instanceParam.value ??
      Instance.UNDEFINED) as Instance;
    this.folder = this.folderParam.value ?? process.cwd();
    if (this.instance === Instance.UNDEFINED && this.folderParam.value) {
      this.instance = Instance.FOLDER;
    }
    return super.onExecute();
  }
}

async function main() {
  return new Cli().executeWithoutErrorHandling();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises, unicorn/prefer-top-level-await
main().then(() => {});
