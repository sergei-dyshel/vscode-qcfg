import type {
  Disposable,
  ExtensionContext,
  FileChangeEvent,
  FileStat,
  FileSystemProvider,
} from 'vscode';
import { EventEmitter, FileType, Uri, window, workspace } from 'vscode';
import { assert } from '../../library/exception';
import { handleErrorsAsync } from './exception';
import { getTempFile } from './fileUtils';
import { Modules } from './module';
import { runSubprocessAndWait } from './subprocess';

const SCHEME = 'qsshfs';

export async function openRemoteFileViaSsh(hostPath: string) {
  const [host, path] = hostPath.split(':');
  const uri = encodeUri(host, path);
  await window.showTextDocument(uri);
}

const onDidChangeFileEmitter = new EventEmitter<FileChangeEvent[]>();

class WatchedFile {
  stat?: FileStat;

  constructor(public uri: Uri) {}
}

// eslint-disable-next-line sonarjs/no-unused-collection
const watchedFiles: WatchedFile[] = [];

function encodeUri(host: string, path: string) {
  return Uri.parse('').with({
    scheme: SCHEME,
    authority: host,
    path: '/' + path,
    query: !path.startsWith('/') ? 'home' : undefined,
  });
}

function decodeUri(uri: Uri) {
  assert(uri.scheme === SCHEME);
  const path = uri.query === 'home' ? uri.path.slice(1) : uri.path;
  return [uri.authority, path];
}

function uriToArg(uri: Uri) {
  const [host, path] = decodeUri(uri);
  return `${host}:${path}`;
}

const sshFsProvider: FileSystemProvider = {
  onDidChangeFile: onDidChangeFileEmitter.event,

  watch(
    uri: Uri,
    _options: { recursive: boolean; excludes: string[] },
  ): Disposable {
    watchedFiles.push(new WatchedFile(uri));
    return {
      dispose() {
        throw new Error('unimplemented');
      },
    };
  },

  async stat(uri: Uri): Promise<FileStat> {
    const [host, path] = decodeUri(uri);
    const result = await runSubprocessAndWait([
      'ssh',
      host,
      `/usr/bin/stat  --printf "%F\\n%W\\n%Y\\n%s" ${path}`,
    ]);
    const attrs = result.stdout.split('\\n');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const type: FileType = (
      {
        'regular file': FileType.File,
        directory: FileType.Directory,
        'symbolik link': FileType.SymbolicLink,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any
    )[attrs[0]]!;
    const ctime = attrs[1] === '?' ? 0 : (attrs[1] as unknown as number);
    const mtime = attrs[2] === '?' ? 0 : (attrs[1] as unknown as number);
    const size =
      type === FileType.Directory ? 0 : (attrs[3] as unknown as number);

    return { type, ctime, mtime, size };
  },

  readDirectory(
    _uri: Uri,
  ): Array<[string, FileType]> | Thenable<Array<[string, FileType]>> {
    throw new Error('unimplementd');
  },

  createDirectory(_uri: Uri): void | Thenable<void> {
    throw new Error('unimplemented');
  },

  readFile: handleErrorsAsync(async (uri: Uri): Promise<Uint8Array> => {
    const temp = getTempFile();
    await runSubprocessAndWait(['scp', uriToArg(uri), temp]);
    return workspace.fs.readFile(Uri.file(temp));
  }),

  async writeFile(
    uri: Uri,
    content: Uint8Array,
    _options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    const temp = getTempFile();
    await workspace.fs.writeFile(Uri.file(temp), content);
    await runSubprocessAndWait(['scp', temp, uriToArg(uri)]);
  },

  delete(_uri: Uri, _options: { recursive: boolean }): void | Thenable<void> {
    throw new Error('unimplemented');
  },

  rename(
    _oldUri: Uri,
    _newUri: Uri,
    _options: { overwrite: boolean },
  ): void | Thenable<void> {
    throw new Error('unimplemented');
  },
};

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    workspace.registerFileSystemProvider(SCHEME, sshFsProvider, {
      isCaseSensitive: true,
      isReadonly: false,
    }),
  );
}

Modules.register(activate);
