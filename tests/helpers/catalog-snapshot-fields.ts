import type { Build } from '@leyline/schema';
import { createRuntimeCatalog } from '../../tools/lib/runtime-catalog.mjs';
import { readCalculationData } from '../../tools/lib/catalog-data.mjs';
let catalog: ReturnType<typeof createRuntimeCatalog>;

export async function catalogSnapshotFields(characterId: string, weaponId: string) {
  const runtime = await (catalog ??= createRuntimeCatalog());
  const character = await runtime.get('characters', characterId), weapon = await runtime.get('weapons', weaponId);
  const artifactMain = readCalculationData('src/game-data/data/tables/artifact-main.json');
  return { schemaVersion: '0.3.0', kind: 'calculation-build', dataVersion: character.dataVersion, character, weapon, artifactMain,
    sources: runtime.library.sources.filter((s: Build['sources'][number]) => s.id === 'content.artifact-main'), artifactMainSourceRefs: ['content.artifact-main'] } satisfies Pick<Build, 'schemaVersion' | 'kind' | 'dataVersion' | 'character' | 'weapon' | 'artifactMain' | 'sources' | 'artifactMainSourceRefs'>;
}
