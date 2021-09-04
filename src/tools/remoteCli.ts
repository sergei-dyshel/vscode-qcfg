/* eslint-disable class-methods-use-this */
import type {
  CommandLineChoiceParameter,
  CommandLineStringParameter,
  CommandLineIntegerParameter,
  ICommandLineActionOptions,
} from '@rushstack/ts-command-line';
import {
  CommandLineParser,
  CommandLineAction,
} from '@rushstack/ts-command-line';
import { StreamHandler } from '../library/loggingHandlers';
import { LogLevel, registerLogHandler } from '../library/logging';
import * as nodejs from '../library/nodejs';
import type { RemoteClient, IdentifiedClient } from '../library/remoteClient';
import { MultiClient } from '../library/remoteClient';
import { abort, assert } from '../library/exception';
import { parseNumber } from '../library/stringUtils';

enum Instance {
  AUTO = 'auto',
  FOLDER = 'folder',
  ALL = 'all',
}

abstract class CliAction extends CommandLineAction {
  protected client?: IdentifiedClient;

  constructor(
    protected cli: Cli,
    private readonly options: ICommandLineActionOptions,
    private readonly opts?: {
      autoInstance?: Instance;
      allAllowed?: boolean;
    },
  ) {
    super(options);
  }

  async onExecute() {
    if (this.cli.instance === Instance.ALL) {
      assert(
        this.opts?.allAllowed,
        `Can not use ${this.options.actionName} with multiple instances`,
      );
    } else if (this.cli.instance === Instance.AUTO)
      this.client = this.cli.getClient(
        this.opts?.autoInstance ??
          abort(`Must specify instance for ${this.options.actionName} command`),
      );
    else this.client = this.cli.getClient(this.cli.instance);
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
      },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  onDefineParameters() {}

  override async onExecute() {
    await super.onExecute();
    console.log(this.cli.multiClient.clients);
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
    if (this.cli.instance === Instance.ALL)
      await this.cli.multiClient.sendNoResult('reloadWindow', {});
    else await this.client!.sendNoResult('reloadWindow', {});
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
    if (this.cli.instance === Instance.ALL)
      await this.cli.multiClient.sendNoResult('executeCommand', {
        name: this.name.value!,
      });
    else
      await this.client!.sendNoResult('executeCommand', {
        name: this.name.value!,
      });
  }
}

class OpenAction extends CliAction {
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
        autoInstance: Instance.FOLDER,
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
  client?: RemoteClient;

  private verbose!: CommandLineIntegerParameter;
  private instanceParam!: CommandLineChoiceParameter;
  private folderParam!: CommandLineStringParameter;

  constructor() {
    super({
      toolFilename: 'remoteCli',
      toolDescription: 'Control vscode remotely',
    });
    this.addAction(new OpenAction(this));
    this.addAction(new IdentifyAction(this));
    this.addAction(new CommandAction(this));
    this.addAction(new ReloadAction(this));
    this.addAction(new OpenSshAction(this));
  }

  protected onDefineParameters() {
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
      alternatives: Object.keys(Instance).map((x) => x.toLowerCase()),
      defaultValue: Instance.AUTO,
    });
    this.folderParam = this.defineStringParameter({
      parameterLongName: '--folder',
      parameterShortName: '-f',
      description: 'Find instance by workspace folder',
      argumentName: 'FOLDER',
    });
  }

  getClient(instance: Instance): IdentifiedClient {
    switch (instance) {
      case Instance.FOLDER:
        return (
          this.multiClient.findByFolder(this.folder) ??
          abort('Could not find server with workspace folder', this.folder)
        );
      case Instance.AUTO:
        abort('Must specify client selection other than AUTO');
        break;
      case Instance.ALL:
        abort('Should not select client with instance value of ALL');
        break;
    }
  }

  protected override async onExecute() {
    const handler = new StreamHandler('stderr', process.stderr);
    handler.level = LogLevel.NOTICE - this.verbose.value!;
    handler.formatOptions = { preset: 'short' };
    registerLogHandler(handler);

    this.multiClient = await MultiClient.connect();

    this.instance = this.instanceParam.value! as Instance;
    this.folder = this.folderParam.value ?? process.cwd();
    if (this.instance === Instance.AUTO) {
      if (this.folderParam.value) this.instance = Instance.FOLDER;
    }
    return super.onExecute();
  }
}

async function main() {
  await new Cli().executeWithoutErrorHandling();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
