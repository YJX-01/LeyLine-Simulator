import { catalogInventory, readCalculationData } from './catalog-data.mjs';

import { assembleCalculationLibrary } from '../../src/game-data/src/calculation-library.mjs';
export { assembleCalculationLibrary };

/** Read the same maintained inputs for independent numeric checks, without generated snapshots. */
export function readCalculationLibrary(read = readCalculationData) {
  const base = 'src/game-data/data';
  const manifest = catalogInventory();
  const entities = [['characters', manifest.characters], ['weapons', manifest.weapons], ['artifact-sets', manifest.sets], ['actions', manifest.actions]]
    .flatMap(([folder, ids]) => ids.map(id => read(`${base}/${folder}/${id}.json`)));
  return assembleCalculationLibrary(read(`${base}/calculation/common.json`), read(`${base}/calculation/reactions.json`), entities);
}
