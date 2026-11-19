import { readFileSync } from 'node:fs';
import type { Build } from '@leyline/schema';

/** Read generated, closed snapshots for Node-side browser driver data. */
export function catalogSnapshotFields(characterId: string, weaponId: string): Pick<Build, 'schemaVersion' | 'kind' | 'character' | 'weapon' | 'artifactMain' | 'dataVersion' | 'sources' | 'artifactMainSourceRefs'> {
  const read = (name: string) => JSON.parse(readFileSync(`src/game-data/generated/${name}`, 'utf8'));
  const index = read('chunk-index.json');
  const character = read(index.characters[characterId]).find((character: Build['character']) => character.id === characterId);
  const weapon = read(index.weapons[weaponId]).find((weapon: Build['weapon']) => weapon.id === weaponId);
  return { schemaVersion: 3, kind: 'calculation-build', dataVersion: character.dataVersion, character, weapon,
    artifactMain: read('artifact-main.json'), ...read('build-sources.json') };
}
