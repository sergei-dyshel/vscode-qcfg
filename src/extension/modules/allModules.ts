// must be first
import * as logging from './logging';

import * as alternate from './alternate';
import * as autoSync from './autoSync';
import * as callHierarchy from './callHierarchy';
import * as codeActions from './codeActions';
import * as colorTheme from './colorTheme';
import * as commandUtils from './commandUtils';
import * as config from './config';
import * as ctags from './ctags';
import * as diagnostics from './diagnostics';
import * as dialog from './dialog';
import * as documentCache from './documentCache';
import * as editHistory from './editHistory';
import * as editing from './editing';
import * as editorGroups from './editorGroups';
import * as eslintDiagnostic from './eslintDiagnostic';
import * as exception from './exception';
import * as expandSelection from './expandSelection';
import * as formatting from './formatting';
import * as fuzzySearch from './fuzzySearch';
import * as git from './git';
import * as gtags from './gtags';
import * as history from './history';
import * as langClient from './langClient';
import * as language from './language';
import * as liveLocation from './liveLocation';
import * as locationTree from './locationTree';
import * as misc from './misc';
import * as multipleSelection from './multipleSelection';
import * as notes from './notes';
import * as peekOutline from './peekOutline';
import * as readOnlyProject from './readOnlyProject';
import * as remoteControl from './remoteControl';
import * as remoteServer from './remoteServer';
import * as renameReferences from './renameReferences';
import * as saveAll from './saveAll';
import * as savedSearch from './savedSearch';
import * as search from './search';
import * as smartCopy from './smartCopy';
import * as sshFs from './sshFs';
import * as syntaxTreeView from './syntaxTreeView';
import * as taskRunner from './taskRunner';
import * as tasksMain from './tasks/main';
import * as treeSelectionRanges from './treeSelectionRanges';
import * as treeSitter from './treeSitter';
import * as treeView from './treeView';
import * as updateChecker from './updateChecker';
import * as windowState from './windowState';
import * as workspaceHistory from './workspaceHistory';

export const ALL_MODULES = {
  language,
  editing,
  autoSync,
  gtags,
  ctags,
  saveAll,
  treeSitter,
  alternate,
  misc,
  readOnlyProject,
  logging,
  editHistory,
  dialog,
  remoteControl,
  windowState,
  search,
  colorTheme,
  taskRunner,
  fuzzySearch,
  treeView,
  locationTree,
  syntaxTreeView,
  workspaceHistory,
  multipleSelection,
  config,
  tasksMain,
  liveLocation,
  documentCache,
  formatting,
  eslintDiagnostic,
  diagnostics,
  exception,
  savedSearch,
  peekOutline,
  editorGroups,
  sshFs,
  langClient,
  remoteServer,
  smartCopy,
  callHierarchy,
  git,
  notes,
  history,
  treeSelectionRanges,
  expandSelection,
  commandUtils,
  codeActions,
  updateChecker,
  renameReferences,
};
