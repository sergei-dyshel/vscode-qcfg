import { TextLogHandler, log } from './logging';
import * as nodejs from './nodejs';

export class ConsoleHandler extends TextLogHandler {
  constructor() {
    super('Console');
  }

  // eslint-disable-next-line class-methods-use-this
  append(formattedMsg: string) {
    console.log(formattedMsg);
  }
}

export class FileHandler extends TextLogHandler {
  private fd: number | undefined;

  constructor(public fileName: string) {
    super('File ' + nodejs.path.basename(fileName));
    this.fd = nodejs.fs.openSync(this.fileName, 'w');
  }

  append(formattedMsg: string) {
    if (!this.fd) return;
    nodejs.fs.write(this.fd, formattedMsg + '\n', error => {
      if (error) {
        log.error('Could not write to log file, closing the file');
        nodejs.fs.close(this.fd!, () => {});
        this.fd = undefined;
      }
    });
  }
}
