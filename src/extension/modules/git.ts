import type { ExtensionContext, TextEditor } from 'vscode';
import { workspace, env, Uri, window } from 'vscode';

import { Modules } from './module';

import * as nodegit from 'nodegit';
import { registerAsyncCommandWrapped } from './exception';
import { getActiveTextEditor } from './utils';

import * as nodejs from '../../library/nodejs';
import { log } from '../../library/logging';
import { assert, assertNotNull } from '../../library/exception';
import { expandTemplate } from '../../library/stringUtils';
import { selectFromListMru } from './dialog';
import { isSubPath } from '../../library/pathUtils';

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
  blameCommit?: string;
  branch?: {
    name: string;
    upstream?: {
      name: string;
      remote?: RemoteInfo;
    };
  };
  origin?: RemoteInfo;
}

interface CfgLink {
  title: string;
  url: string;
}

interface Link extends CfgLink {
  tag: string;
}

interface ConfigEntry {
  remotes: string[];
  links: CfgLink[];
}

async function getRemoteInfo(repo: nodegit.Repository, name: string) {
  const remote = await repo.getRemote(name);
  return {
    name: remote.name(),
    url: remote.url(),
  };
}

function shortenRemoteBranch(branch: string, remote: string): string {
  if (branch.startsWith(remote + '/')) {
    return branch.replace(remote + '/', '');
  }
  return branch;
}

async function getInfo(editor: TextEditor) {
  const document = editor.document;
  const line = editor.selection.active.line + 1;
  const repo = await nodegit.Repository.openExt(
    nodejs.path.dirname(document.fileName),
    0,
    '',
  );

  const hash = (await repo.getHeadCommit()).sha();
  const file = nodejs.path.relative(repo.workdir(), document.fileName);
  const blame = await nodegit.Blame.file(repo, file);
  // getHunkByLine may return undefined if no hunk found
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const blameCommit = blame.getHunkByLine(line)?.finalCommitId().tostrS();
  const info: Info = {
    workdir: repo.workdir(),
    file,
    line,
    hash,
    blameCommit,
    shortHash: hash.substr(0, SHORT_SHA_LEN),
  };
  try {
    const branch = await repo.getCurrentBranch();
    info.branch = { name: branch.shorthand() };
    try {
      const upstream = await nodegit.Branch.upstream(branch);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const remoteName = await (nodegit.Branch as any).remoteName(
        repo,
        upstream.name(),
      );
      info.branch.upstream = {
        name: shortenRemoteBranch(upstream.shorthand(), remoteName),
        remote: await getRemoteInfo(repo, remoteName),
      };
      // eslint-disable-next-line no-empty
    } catch (_: unknown) {}
    // eslint-disable-next-line no-empty
  } catch (_: unknown) {}
  try {
    info.origin = await getRemoteInfo(repo, 'origin');
    // eslint-disable-next-line no-empty
  } catch (_: unknown) {}
  return info;
}

async function dump() {
  const editor = getActiveTextEditor();
  const info = await getInfo(editor);
  const infoStr = JSON.stringify(info, null /* replacer */, 4 /* space */);
  log.info(infoStr);
  await window.showInformationMessage(infoStr);
}

async function showWebLinks() {
  const config = workspace
    .getConfiguration()
    .get('qcfg.git.web', []) as ConfigEntry[];
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
    blameHash: info.blameCommit,
  };
  const remoteUrl = remote.url;
  const links: Link[] = [];
  for (const cfgEntry of config) {
    try {
      for (const cfgRemote of cfgEntry.remotes) {
        const regexp = new RegExp(cfgRemote);
        if (!regexp.exec(remoteUrl)) continue;
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

  const selectedLink = await selectFromListMru(
    uniqLinks,
    (link: Link) => ({
      label: link.title,
    }),
    'web_links',
    (link) => link.tag,
  );

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
