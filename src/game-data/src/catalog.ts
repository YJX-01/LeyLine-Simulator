/** Fixed, independently generated game snapshots. No runtime reference checkout dependency. */
import version from '../generated/version.json';
import chunkIndex from '../generated/chunk-index.json';
import { chunkLoaders } from '../generated/chunk-loaders';
export const DATA_VERSION = version;
import type { ArtifactItem, ArtifactMainTable, Build, CharacterActionsDefinition, CharacterDefinition, DefinitionRef, WeaponDefinition, ArtifactSetDefinition, StatKey, Element } from '@leyline/schema';
export type { CharacterDefinition, WeaponDefinition, ArtifactSetDefinition, StatKey, Element, ContentSource, Support, Modifier } from '@leyline/schema';
export interface GameCatalog {
  version: string;
  characters: { id: string; name: string; element: Element; weaponType: string; supported: boolean; reason: string }[];
  weapons: { id: string; name: string; weaponType: string; rarity: number; supported: boolean; reason: string }[];
  sets: { id: string; name: string; rarity: number; rarities: number[]; slots: ArtifactItem['slot'][] }[];
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const indices: Record<'characters' | 'weapons' | 'sets', Record<string, string>> = chunkIndex;
async function loadEntity<T>(kind: keyof typeof indices, id: string): Promise<T> {
  const chunk = indices[kind][id], loader = chunk && chunkLoaders[chunk];
  if (!loader) throw new Error('所选内容不存在，请重新选择。');
  const entries = (await loader()).default as { id: string }[];
  const entity = entries.find(entry => entry.id === id);
  if (!entity) throw new Error('内容分块与索引不一致。');
  return clone(entity) as T;
}
export async function loadCatalog(): Promise<GameCatalog> { return clone((await import('../generated/catalog.json')).default as GameCatalog); }
export async function getCharacter(id: string): Promise<CharacterDefinition> { return loadEntity('characters', id); }
export async function getWeapon(id: string): Promise<WeaponDefinition> { return loadEntity('weapons', id); }
export async function getArtifactSet(id: string): Promise<ArtifactSetDefinition> { return loadEntity('sets', id); }
export async function getBuildSources(): Promise<Pick<Build, 'sources' | 'artifactMainSourceRefs'>> {
  return clone((await import('../generated/build-sources.json')).default as unknown as Pick<Build, 'sources' | 'artifactMainSourceRefs'>);
}
export async function getArtifactMain(): Promise<ArtifactMainTable> {
  return clone((await import('../generated/artifact-main.json')).default as ArtifactMainTable);
}
/** Optional exact-revision companion. Absence never selects a newer character or guessed actions. */
export async function getCharacterActions(character: DefinitionRef): Promise<CharacterActionsDefinition | null> {
  const entries = (await import('../generated/actions.json')).default as unknown as CharacterActionsDefinition[];
  const definition = entries.find(entry => entry.character.namespace === character.namespace && entry.character.id === character.id && entry.character.revision === character.revision);
  return definition ? clone(definition) : null;
}
