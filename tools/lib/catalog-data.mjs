import { assembleEquipment } from '../../src/game-data/src/equipment-metadata.mjs';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readContentSource } from './content-source.mjs';
import { assembleCharacter } from '../../src/game-data/src/character-metadata.mjs';
import { DATA_VERSION } from '../../src/game-data/src/version.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
export function catalogInventory() {
  const ids = folder => readdirSync(resolve(root, 'src/game-data/data', folder)).sort().map(file => {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/.test(file)) throw new Error('Invalid catalog filename: ' + file);
    return file.slice(0, -5);
  });
  // Base entries precede alternate forms. Traveler elements follow their in-game release order.
  const elements = ['anemo', 'geo', 'electro', 'dendro', 'hydro', 'pyro', 'cryo'];
  const formOrder = id => {
    const [owner, element] = id.split('-');
    if (!element) return 0;
    if (owner === 'aether') return 1 + elements.indexOf(element);
    if (owner === 'lumine') return 8 + elements.indexOf(element);
    return 15;
  };
  const characters = ids('characters').sort((left, right) => formOrder(left) - formOrder(right));
  return { dataVersion: DATA_VERSION, characters, weapons: ids('weapons'), sets: ids('artifact-sets'), actions: ids('actions') };
}

/** Tools that evaluate calculations consume the same in-memory view as the application. */
export function readCalculationData(path) {
  const file = path instanceof URL ? fileURLToPath(path) : resolve(root, path);
  const raw = readContentSource(file);
  if (raw.kind === 'weapon-definition' || raw.kind === 'artifact-set-definition') return assembleEquipment(raw);
  if (raw.kind !== 'character-definition') return raw;
  const curves = readContentSource(resolve(root, 'src/game-data/data/tables/character-curves.json'));
  return assembleCharacter(raw, curves, DATA_VERSION);
}
