import type { ExtensionContext, Location, Uri } from 'vscode';
import { DisposableHolder } from '../../library/disposable';
import { check, checkNotNull } from '../../library/exception';
import { QuickPickLocations } from '../utils/quickPick';
import { mapAsync } from './async';
import {
  registerAsyncCommandWrapped,
  registerSyncCommandWrapped,
} from './exception';
import { peekLocations, quickPickLocations } from './fileUtils';
import { updateHistory } from './history';
import { LiveLocation, LiveLocationArray } from './liveLocation';
import { setPanelLocations } from './locationTree';
import { Modules } from './module';
import { getActiveTextEditor, getCurrentLocation } from './utils';

const MAX_SAVED_SEARCHES = 20;

export function dedupeLocations(locations: Location[]): Location[] {
  return locations.uniq((loc1, loc2) => loc1.range.isEqual(loc2.range));
}

export async function saveAndPeekSearch(
  name: string,
  func: () => Promise<Location[]>,
  location?: Location,
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
      location,
      details: {
        numLocations: locations.length,
        numFiles: calcNumFiles(locations),
      },
    });
    if (savedSearches.length > MAX_SAVED_SEARCHES) savedSearches.pop();
  }
  // if peekLocations opens peek window it will return immediately and
  // choosen location will not be pushed to history here but in qcfg.peek.openReference* commands
  await updateHistory(peekLocations(locations));
}

//
// Private
//

async function setLastLocations(locations: Location[]) {
  const newLocs = new LiveLocationArray();
  await mapAsync(locations, async (loc) => {
    newLocs.push(await LiveLocation.fromLocation(loc));
  });
  lastLocations.set(newLocs);
}

function calcNumFiles(locations: Location[]): number {
  const set = new Set<Uri>(locations.map((loc) => loc.uri).iter());
  return set.size;
}

interface SavedSearch {
  name: string;
  func: () => Promise<Location[]>;
  location?: Location;
  details: {
    numLocations: number;
    numFiles: number;
  };
}

async function showLastLocationsInPanel() {
  if (!lastName) {
    throw new Error('No search was issued yet');
  }
  return updateHistory(
    setPanelLocations(lastName, lastLocations.get()!.locations()),
  );
}

async function quickPickLastLocations() {
  if (!lastName) {
    throw new Error('No search was issued yet');
  }
  return updateHistory(quickPickLocations(lastLocations.get()!.locations()));
}

function selectLastLocationsInCurrentEditor() {
  const editor = getActiveTextEditor();
  const lastLoc = lastLocations.get();
  checkNotNull(lastLoc, 'No last locations');
  const selections = lastLoc
    .locations()
    .filter((loc) => loc.uri.equals(editor.document.uri))
    .map((loc) => loc.range.asSelection());
  check(!selections.isEmpty, 'No results in current file');
  editor.selections = selections;
  editor.revealRange(selections[0]);
}

async function rerunPreviousSearch() {
  const currLoc = getCurrentLocation();
  const qp = new QuickPickLocations<SavedSearch>(
    (search) => ({
      label: search.name,
      description: `${search.details.numLocations} locations in ${search.details.numFiles} files`,
    }),
    (search) => search.location ?? currLoc,
    savedSearches,
  );
  const prevSearch = await qp.select();
  if (!prevSearch) return;
  savedSearches.removeFirst(prevSearch);
  await saveAndPeekSearch(
    prevSearch.name,
    async () => prevSearch.func(),
    prevSearch.location,
  );
}

async function rerunLastSearch() {
  const prevSearch = savedSearches[0];
  checkNotNull(prevSearch, 'No saved searches');
  savedSearches.shift();
  await saveAndPeekSearch(
    prevSearch.name,
    async () => prevSearch.func(),
    prevSearch.location,
  );
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
    registerAsyncCommandWrapped(
      'qcfg.quickPickLastLocations',
      quickPickLastLocations,
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
