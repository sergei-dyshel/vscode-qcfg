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
import { LogLevel, registerLogHandler } from '../library/logging';
import { StreamHandler } from '../library/loggingHandlers';
import * as nodejs from '../library/nodejs';
import type { SyntaxTree } from '../library/syntax';
import { SyntaxLanguage } from '../library/syntax';

const KNOWN_EXTENSIONS: Record<string, string[]> = {
  go: ['.go'],
};

abstract class CliAction extends CommandLineAction {
  constructor(protected cli: Cli, options: ICommandLineActionOptions) {
    super(options);
  }
}

class TreeAction extends CliAction {
  constructor(cli: Cli) {
    super(cli, {
      actionName: 'tree',
      summary: 'Dump syntax tree',
      documentation: 'Parse file syntax tree and dump it in JSON format',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function,class-methods-use-this
  onDefineParameters() {}

  async onExecute() {
    console.log(`Parsing ${this.cli.filename}`);
    console.log(
      JSON.stringify(this.cli.tree.rootNode.toObject(), undefined, 2),
    );
    return Promise.resolve();
  }
}

class Cli extends CommandLineParser {
  language!: string;
  filename!: string;

  private verbose!: CommandLineIntegerParameter;
  private languageParam!: CommandLineChoiceParameter;
  private filenameParam!: CommandLineStringParameter;

  tree!: SyntaxTree;

  constructor() {
    super({
      toolFilename: 'syntaxDump',
      toolDescription: 'Dump file syntax tree in various formats',
    });
    this.addAction(new TreeAction(this));
  }

  protected onDefineParameters() {
    this.languageParam = this.defineChoiceParameter({
      parameterLongName: '--language',
      parameterShortName: '-l',
      description: 'Language of provided source file',
      alternatives: SyntaxLanguage.allSupported(),
    });

    this.filenameParam = this.defineStringParameter({
      parameterLongName: '--filename',
      parameterShortName: '-f',
      description: 'File name to parse',
      argumentName: 'FILENAME',
      required: true,
    });
    this.verbose = this.defineIntegerParameter({
      parameterLongName: '--verbose',
      parameterShortName: '-v',
      argumentName: 'LEVEL',
      description: 'Log verbosity level',
      defaultValue: 0,
    });
  }

  protected override async onExecute() {
    const handler = new StreamHandler('stderr', process.stderr);
    handler.level = LogLevel.NOTICE - this.verbose.value!;
    handler.formatOptions = { preset: 'short' };
    registerLogHandler(handler);

    this.filename = this.filenameParam.value!;
    this.language = this.languageParam.value ?? detectLanguage(this.filename);
    this.tree = await SyntaxLanguage.get(this.language).parse(
      nodejs.fs.readFileSync(this.filename).toString(),
    );
    return super.onExecute();
  }
}

function detectLanguage(filename: string): string {
  const ext = nodejs.path.extname(filename);
  for (const language in KNOWN_EXTENSIONS) {
    if (KNOWN_EXTENSIONS[language].includes(ext)) {
      return language;
    }
  }
  throw new Error(`Couldn't auto-detect language of ${filename}`);
}

async function main() {
  await new Cli().executeWithoutErrorHandling();
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
main();
