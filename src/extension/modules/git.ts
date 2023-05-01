import type { ExtensionContext, TextEditor } from 'vscode';
import { env, Uri, window } from 'vscode';
import type { Config } from '../../library/config';
import { assert, assertNotNull } from '../../library/exception';
import { log } from '../../library/logging';
import * as nodejs from '../../library/nodejs';
import { isSubPath } from '../../library/pathUtils';
import { expandTemplate } from '../../library/stringUtils';
import { getConfiguration } from '../utils/configuration';
import { PersistentGenericQuickPick } from '../utils/quickPickPersistent';
import { registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';
import { getActiveTextEditor } from './utils';
import type { SimpleGit } from 'simple-git';
import simpleGit from 'simple-git';
import { dirName } from '../../library/pathUtils';
import { splitWithRemainder } from '../../library/stringUtils';

const SHORT_SHA_LEN = 7;

interface RemoteInfo {
  name: string;
  url: string;
}

interface Info {
  hash: string;
  shortHash: string;
  file: string;
  line: number;
  workdir: string;
  branch?: {
    name: string;
    upstream?: {
      name: string;
      remote?: RemoteInfo;
    };
  };
  origin?: RemoteInfo;
}

interface Link extends Config.Git.Link {
  tag: string;
}

async function getRemoteInfo(git: SimpleGit, name: string) {
  const config = await git.getConfig(`remote.${name}.url`);
  return { name, url: config.value! };
}

async function getInfo(editor: TextEditor) {
  const document = editor.document;
  const line = editor.selection.active.line + 1;
  const fileDir = dirName(document.uri.fsPath);
  const git = simpleGit(fileDir);
  const workdir = await git.revparse(['--show-toplevel']);
  await git.cwd(workdir);
  const hash = await git.revparse('HEAD');

  const file = nodejs.path.relative(workdir, document.fileName);
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const info: Info = {
    workdir,
    file,
    line,
    hash,
    shortHash: hash.slice(0, SHORT_SHA_LEN),
  };
  try {
    const branch = await git.revparse(['--abbrev-ref', 'HEAD']);
    if (branch !== 'HEAD') {
      info.branch = { name: branch };
      try {
        const upstream = await git.revparse([
          '--abbrev-ref',
          '--symbolic-full-name',
          '@{u}',
        ]);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        const [remoteName, remoteBranch] = splitWithRemainder(
          upstream,
          /\//,
          1,
        );
        info.branch.upstream = {
          name: remoteBranch,
          remote: await getRemoteInfo(git, remoteName),
        };
        // eslint-disable-next-line no-empty
      } catch {}
    }
    // eslint-disable-next-line no-empty
  } catch {}
  try {
    info.origin = await getRemoteInfo(git, 'origin');
    // eslint-disable-next-line no-empty
  } catch {}
  return info;
}

async function dump() {
  const editor = getActiveTextEditor();
  const info = await getInfo(editor);
  const infoStr = JSON.stringify(info, undefined /* replacer */, 4 /* space */);
  log.info(infoStr);
  await window.showInformationMessage(infoStr);
}

async function showWebLinks() {
  const config = getConfiguration().getNotNull('qcfg.git.web');
  assert(config.length > 0, 'Git web links not configured');

  const editor = getActiveTextEditor();
  const document = editor.document;
  const filename = document.fileName;
  const info = await getInfo(editor);
  const remote = info.branch?.upstream?.remote ?? info.origin;
  assertNotNull(remote, 'No tracking branch and no "origin" remote found');

  assert(
    isSubPath(info.workdir, filename),
    `Expected file ${filename} to be relative to Git working dir ${info.workdir}`,
  );
  const subs = {
    hash: info.hash,
    shortHash: info.shortHash,
    branch: info.branch?.upstream?.name ?? info.branch?.name,
    file: info.file,
    line: info.line.toString(),
  };
  const remoteUrl = remote.url;
  const links: Link[] = [];
  for (const cfgEntry of config) {
    try {
      for (const cfgRemote of cfgEntry.remotes) {
        const regexp = new RegExp(cfgRemote);
        if (!regexp.test(remoteUrl)) continue;
        for (const linkCfg of cfgEntry.links) {
          try {
            const title = expandTemplate(
              remoteUrl.replace(regexp, linkCfg.title),
              subs,
              true /* throwWhenNotExist */,
            );
            const url = expandTemplate(
              remoteUrl.replace(regexp, linkCfg.url),
              subs,
              true /* throwWhenNotExist */,
            );
            const tag = linkCfg.title;
            links.push({ title, url, tag });
          } catch (err: unknown) {
            log.debug(
              `Error processing config Git web link config entry link ${linkCfg.title}: ${err}`,
            );
          }
        }
        break;
      }
    } catch (err: unknown) {
      log.debug(`Error processing config Git web link config entry: ${err}`);
    }
  }

  assert(links.length > 0, `No Git web links found`);

  const uniqLinks = links.uniq((x, y) => x.url === y.url);

  const qp = new PersistentGenericQuickPick(
    (link: Link) => ({
      label: link.title,
    }),
    (link) => link.tag,
    'web_links',
    uniqLinks,
  );
  const selectedLink = await qp.select();

  if (!selectedLink) return;
  log.debug(`Opening Git web link: ${selectedLink.url}`);
  await env.openExternal(Uri.parse(selectedLink.url, true /* strict */));
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.git.dump', dump),
    registerAsyncCommandWrapped('qcfg.git.weblinks', showWebLinks),
  );
}

Modules.register(activate);
