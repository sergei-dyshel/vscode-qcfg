import type { ExtensionContext } from 'vscode';
import { CheckError } from '../../library/exception';
import { registerAsyncCommandWrapped } from './exception';
import { Modules } from './module';
import { runTask } from './tasks/main';
import { Flag, TaskType } from './tasks/params';
import { getActiveTextEditor, getCursorWordContext } from './utils';

async function searchWordUnderCursor(allFolders: boolean) {
  if (!getCursorWordContext()) {
    throw new CheckError('The cursor is not on word');
  }
  return runTask(
    'search_word',
    {
      type: TaskType.SEARCH,
      // eslint-disable-next-line no-template-curly-in-string
      searchTitle: 'Word "${cursorWord}"',
      // eslint-disable-next-line no-template-curly-in-string
      query: '${cursorWord}',
      flags: [Flag.CASE, Flag.WORD],
    },
    { folder: allFolders ? 'all' : undefined },
  );
}

async function searchSelectedText(allFolders: boolean) {
  if (getActiveTextEditor().selection.isEmpty) {
    throw new CheckError('No text selected');
  }
  return runTask(
    'search_selection',
    {
      type: TaskType.SEARCH,
      // eslint-disable-next-line no-template-curly-in-string
      searchTitle: 'Selected text "${selectedText}"',
      // eslint-disable-next-line no-template-curly-in-string
      query: '${selectedText}',
      flags: [Flag.CASE],
    },
    { folder: allFolders ? 'all' : undefined },
  );
}

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped('qcfg.search.word', async () =>
      searchWordUnderCursor(false),
    ),
    registerAsyncCommandWrapped('qcfg.search.word.allFolders', async () =>
      searchWordUnderCursor(true),
    ),
    registerAsyncCommandWrapped('qcfg.search.selectedText', async () =>
      searchSelectedText(false),
    ),
    registerAsyncCommandWrapped(
      'qcfg.search.selectedText.allFolders',
      async () => searchSelectedText(true),
    ),
  );
}

Modules.register(activate);
