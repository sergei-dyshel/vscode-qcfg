import { SyntaxSymbol } from './symbol';

export interface File {
  folder: string;
  path: string;
}

export interface FileWithDate extends File {
  date: Date;
}

export interface SyntaxSymbolWithDate extends SyntaxSymbol {
  date: Date;
}

export interface DbEngine {
  connect: (folder: string, workspaceName: string) => Promise<void>;
  getFileSymbols: (file: File) => Promise<SyntaxSymbolWithDate[]>;
}
