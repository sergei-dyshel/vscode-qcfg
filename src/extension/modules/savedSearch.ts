import { Modules } from './module';
import { ExtensionContext, Location, Uri } from 'vscode';
import { peekLocations } from './fileUtils';
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { setPanelLocations } from './locationTree';
import { selectFromList } from './dialog';
import { LiveLocationArray } from './liveLocation';
import { DisposableHolder } from '../../library/types';
import { checkNonNull, check } from '../../library/exception';
import { getActiveTextEditor } from './utils';

const MAX_SAVED_SEARCHES = 20;

export function dedupeLocations(locations: Location[]): Location[] {
  return locations.uniq((loc1, loc2) => loc1.range.isEqual(loc2.range));
}

export async function saveAndPeekSearch(
  name: string,
  func: () => Promise<Location[]>,
) {
  let locations = await func();
  if (locations.length === 0) {
    return;
  }
  locations = dedupeLocations(locations);
  if (locations.length > 1) {
    lastName = name;
    await setLastLocations(locations);
    savedSearches.unshift({
      name,
      func,
      details: {
        numLocations: locations.length,
        numFiles: calcNumFiles(locations),
      },
    });
    if (savedSearches.length > MAX_SAVED_SEARCHES) savedSearches.pop();
  }
  await peekLocations(locations);
}

//
// Private
//

async function setLastLocations(locations: Location[]) {
  const newLocs = new LiveLocationArray();
  for (const loc of locations) {
    newLocs.addAsync(loc);
  }
  lastLocations.set(newLocs);
}

function calcNumFiles(locations: Location[]): number {
  const set = new Set<Uri>(locations.map((loc) => loc.uri).iter());
  return set.size;
}

interface SavedSearch {
  name: string;
  func(): Promise<Location[]>;
  details: {
    numLocations: number;
    numFiles: number;
  };
}

async function showLastLocationsInPanel() {
  if (!lastName) {
    throw Error('No search was issued yet');
  }
  return setPanelLocations(lastName, lastLocations.get()!.locations());
}

function selectLastLocationsInCurrentEditor() {
  const editor = getActiveTextEditor();
  const selections = checkNonNull(lastLocations.get(), 'No last locations')
    .locations()
    .filter((loc) => {
      return loc.uri.toString() === editor.document.uri.toString();
    })
    .map((loc) => loc.range.asSelection());
  check(!selections.isEmpty, 'No results in current file');
  editor.selections = selections;
  editor.revealRange(selections[0]);
}

async function rerunPreviousSearch() {
  const prevSearch = await selectFromList(savedSearches, (search) => ({
    label: search.name,
    description: `${search.details.numLocations} locations in ${search.details.numFiles} files`,
  }));
  if (!prevSearch) return;
  savedSearches.removeFirst(prevSearch);
  await saveAndPeekSearch(prevSearch.name, async () => prevSearch.func());
}

async function rerunLastSearch() {
  const prevSearch = checkNonNull(savedSearches.top, 'No saved searches');
  savedSearches.removeFirst(prevSearch);
  await saveAndPeekSearch(prevSearch.name, async () => prevSearch.func());
}

const savedSearches: SavedSearch[] = [];

let lastName: string | undefined;
let lastLocations = new DisposableHolder<LiveLocationArray>();

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerAsyncCommandWrapped(
      'qcfg.showLastLocationsInPanel',
      showLastLocationsInPanel,
    ),
    registerSyncCommandWrapped(
      'qcfg.selectLastLocations',
      selectLastLocationsInCurrentEditor,
    ),
    registerAsyncCommandWrapped('qcfg.rerunLastSearch', rerunLastSearch),
    registerAsyncCommandWrapped(
      'qcfg.rerunPreviousSearch',
      rerunPreviousSearch,
    ),
  );
}

Modules.register(activate);
