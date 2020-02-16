import { Modules } from './module';
import { ExtensionContext, Location, Uri } from 'vscode';
import { peekLocations } from './fileUtils';
import {
  registerSyncCommandWrapped,
  registerAsyncCommandWrapped,
} from './exception';
import { setPanelLocations } from './locationTree';
import { selectFromList } from './dialog';

const MAX_SAVED_SEARCHES = 20;

export async function saveAndPeekSearch(
  name: string,
  func: () => Promise<Location[]>,
) {
  let locations = await func();
  if (locations.length === 0) {
    return;
  }
  locations = locations.uniq((loc1, loc2) => loc1.range.isEqual(loc2.range));
  if (locations.length > 1) {
    lastName = name;
    lastLocations = locations;
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

function calcNumFiles(locations: Location[]): number {
  const set = new Set<Uri>(locations.map(loc => loc.uri).iter());
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

function showLastLocationsInPanel() {
  if (!lastName) {
    throw Error('No search was issued yet');
  }
  setPanelLocations(lastName, lastLocations!);
}

async function rerunPreviousSearch() {
  const prevSearch = await selectFromList(savedSearches, search => ({
    label: search.name,
    description: `${search.details.numLocations} locations in ${search.details.numFiles} files`,
  }));
  if (!prevSearch) return;
  savedSearches.removeFirst(prevSearch);
  await saveAndPeekSearch(prevSearch.name, prevSearch.func);
}

const savedSearches: SavedSearch[] = [];

let lastName: string | undefined;
let lastLocations: Location[] | undefined;

function activate(context: ExtensionContext) {
  context.subscriptions.push(
    registerSyncCommandWrapped(
      'qcfg.showLastLocationsInPanel',
      showLastLocationsInPanel,
    ),
    registerAsyncCommandWrapped(
      'qcfg.rerunPreviousSearch',
      rerunPreviousSearch,
    ),
  );
}

Modules.register(activate);
