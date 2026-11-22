/// <reference path="./catalog-modules.d.ts" />
import { DATA_VERSION } from './version.mjs';
import loaders from 'virtual:leyline-catalog/loaders';
import artifactMain from '../data/tables/artifact-main.json';
import common from '../data/calculation/common.json';
import { assembleCalculationLibrary } from './calculation-library.mjs';
export { DATA_VERSION };
import type { ArtifactItem, ArtifactMainTable, Build, CalculationBundle, CharacterActionsDefinition, CharacterDefinition, DefinitionRef, WeaponDefinition, ArtifactSetDefinition, StatKey, Element } from '@leyline/schema';
export type { CharacterDefinition, WeaponDefinition, ArtifactSetDefinition, StatKey, Element, ContentSource, Support, Modifier } from '@leyline/schema';
export interface GameCatalog {
  version: string;
  characters: { id: string; name: string; element: Element; weaponType: string; supported: boolean; reason: string }[];
  weapons: { id: string; name: string; weaponType: string; rarity: number; supported: boolean; reason: string }[];
  sets: { id: string; name: string; rarity: number; rarities: number[]; slots: ArtifactItem['slot'][] }[];
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
async function loadEntity<T>(kind: 'characters' | 'weapons' | 'sets', id: string): Promise<T> {
  const group = loaders[kind];
  if (!Object.hasOwn(group, id)) throw new Error('所选内容不存在，请重新选择。');
  return clone((await group[id]()).default) as T;
}
export async function loadCatalog(): Promise<GameCatalog> { return clone((await import('virtual:leyline-catalog/list')).default); }
export async function getCharacter(id: string): Promise<CharacterDefinition> { return loadEntity('characters', id); }
export async function getWeapon(id: string): Promise<WeaponDefinition> { return loadEntity('weapons', id); }
export async function getArtifactSet(id: string): Promise<ArtifactSetDefinition> { return loadEntity('sets', id); }
export async function getBuildSources(): Promise<Pick<Build, 'sources' | 'artifactMainSourceRefs'>> {
  return clone({ sources: common.sources.filter(s => s.id === 'content.artifact-main'), artifactMainSourceRefs: ['content.artifact-main'] }) as Pick<Build, 'sources' | 'artifactMainSourceRefs'>;
}
export async function getArtifactMain(): Promise<ArtifactMainTable> {
  return clone(artifactMain as ArtifactMainTable);
}
export async function getReactionCalculationBundle(): Promise<CalculationBundle> {
  const { default: reactions } = await import('../data/calculation/reactions.json');
  return assembleCalculationLibrary(common, reactions, []);
}
/** Optional exact-revision companion. Absence never selects a newer character or guessed actions. */
export async function getCharacterActions(character: DefinitionRef): Promise<CharacterActionsDefinition | null> {
  if (!Object.hasOwn(loaders.actions, character.id)) return null;
  const definition = (await loaders.actions[character.id]()).default as CharacterActionsDefinition;
  return definition.character.namespace === character.namespace && definition.character.revision === character.revision ? clone(definition) : null;
}

export async function loadBattleScenes() {
  const [{ default: definitions }, { sceneDefinitionSchema }] = await Promise.all([import('../data/calculation/battle-scenes.json'), import('@leyline/schema')]);
  return definitions.map(definition => sceneDefinitionSchema.parse(definition));
}
