import type { ExtensionContext, TextDocument } from 'vscode';
import { workspace, env, Uri, window } from 'vscode';

import { Modules } from './module';

import * as nodegit from 'nodegit';
import { registerAsyncCommandWrapped } from './exception';
import { getActiveTextEditor } from './utils';

import * as nodejs from '../../library/nodejs';
import { log } from '../../library/logging';
import { assert, assertNotNull } from '../../library/exception';
import { expandTemplate } from '../../library/stringUtils';
import { selectFromList } from './dialog';
import { isSubPath } from '../../library/pathUtils';

const SHORT_SHA_LEN = 7;

interface RemoteInfo {
  name: string;
  url: string;
}

interface Info {
  hash: string;
  shortHash: string;
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

interface Link {
  title: string;
  url: string;
}

interface ConfigEntry {
  remote: string;
  links: Link[];
}

async function getRemoteInfo(repo: nodegit.Repository, name: string) {
  const remote = await repo.getRemote(name);
  return {
    name: remote.name(),
    url: remote.url(),
  };
}

async function getInfo(document: TextDocument) {
  const repo = await nodegit.Repository.openExt(
    nodejs.path.dirname(document.fileName),
    0,
    '',
  );

  const hash = (await repo.getHeadCommit()).sha();
  const info: Info = {
    workdir: repo.workdir(),
    hash,
    shortHash: hash.substr(0, SHORT_SHA_LEN),
  };

  try {
    const branch = await repo.getCurrentBranch();
    info.branch = { name: branch.shorthand() };
    try {
      const upstream = await nodegit.Branch.upstream(branch);
      info.branch.upstream = { name: upstream.shorthand() };
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      const remoteName = await (nodegit.Branch as any).remoteName(
        repo,
        upstream.name(),
      );
      info.branch.upstream.remote = await getRemoteInfo(repo, remoteName);
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
  const info = await getInfo(editor.document);
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
  const info = await getInfo(editor.document);
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
    file: nodejs.path.relative(info.workdir, filename),
    line: (editor.selection.active.line + 1).toString(),
  };
  const links: Link[] = [];
  for (const cfgEntry of config) {
    try {
      const regexp = new RegExp(cfgEntry.remote);
      if (!regexp.exec(remote.url)) continue;
      for (const linkCfg of cfgEntry.links) {
        try {
          links.push({
            title: expandTemplate(
              remote.url.replace(regexp, linkCfg.title),
              subs,
              true /* throwWhenNotExist */,
            ),
            url: expandTemplate(
              remote.url.replace(regexp, linkCfg.url),
              subs,
              true /* throwWhenNotExist */,
            ),
          });
        } catch (err: unknown) {
          log.debug(
            `Error processing config Git web link config entry link ${linkCfg.title}: ${err}`,
          );
        }
      }
    } catch (err: unknown) {
      log.debug(
        `Error processing config Git web link config entry ${cfgEntry.remote}: ${err}`,
      );
    }
  }

  assert(links.length > 0, `No Git web links found`);

  const selectedLink = await selectFromList(links, (link: Link) => ({
    label: link.title,
    detail: link.url,
  }));

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
