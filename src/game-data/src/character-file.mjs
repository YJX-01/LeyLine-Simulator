import { assembleEquipment } from './equipment-metadata.mjs';
import { definitionKey, structuredWeaponDefinitionSchema, structuredArtifactSetDefinitionSchema, structuredCharacterDefinitionSchema } from '@leyline/schema';
import { assembleCalculationLibrary } from './calculation-library.mjs';
import { createContentLinker } from './link-content.mjs';
import { assembleCharacter } from './character-metadata.mjs';
import standardCurves from '../data/tables/character-curves.json';
import common from '../data/calculation/common.json';
import reactions from '../data/calculation/reactions.json';

export function linkCharacterFile(metadata, dataVersion, collectCalculationRoots, curves = standardCurves) {
  const character = assembleCharacter(metadata, curves, dataVersion);
  const library = assembleCalculationLibrary(common, reactions, [character]);
  return createContentLinker({ schemas: { definitionKey, structuredWeaponDefinitionSchema, structuredArtifactSetDefinitionSchema, structuredCharacterDefinitionSchema }, collectCalculationRoots, library }).character(character);
}

export function linkEquipmentFile(metadata, collectCalculationRoots) {
  const entity = assembleEquipment(metadata);
  const library = assembleCalculationLibrary(common, reactions, [entity]);
  const linker = createContentLinker({ schemas: { definitionKey, structuredWeaponDefinitionSchema, structuredArtifactSetDefinitionSchema }, collectCalculationRoots, library });
  return entity.kind === 'weapon-definition' ? linker.weapon(entity) : linker.set(entity);
}
