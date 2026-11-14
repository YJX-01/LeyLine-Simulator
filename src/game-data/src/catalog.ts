/** Fixed, independently generated game snapshots. No runtime reference checkout dependency. */
import version from '../generated/version.json';
export const DATA_VERSION = version;
import type { CharacterDefinition, WeaponDefinition, ArtifactSetDefinition, StatKey, Element, ReactionRules } from '@leyline/schema';
export type { CharacterDefinition, WeaponDefinition, ArtifactSetDefinition, StatKey, Element, ContentSource, Support, Modifier } from '@leyline/schema';
export interface GameCatalog {
  version: string;
  characters: { id: string; name: string; element: Element; weaponType: string; supported: boolean; reason: string }[];
  weapons: { id: string; name: string; weaponType: string; rarity: number; supported: boolean; reason: string }[];
  sets: { id: string; name: string; rarity: number }[];
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const characters = [
  () => import('../generated/characters-0.json'),
  () => import('../generated/characters-1.json'),
  () => import('../generated/characters-2.json'),
  () => import('../generated/characters-3.json'),
  () => import('../generated/characters-4.json'),
  () => import('../generated/characters-5.json'),
  () => import('../generated/characters-6.json'),
  () => import('../generated/characters-7.json'),
  () => import('../generated/characters-8.json'),
  () => import('../generated/characters-9.json'),
  () => import('../generated/characters-10.json'),
  () => import('../generated/characters-11.json'),
  () => import('../generated/characters-12.json'),
  () => import('../generated/characters-13.json'),
  () => import('../generated/characters-14.json'),
  () => import('../generated/characters-15.json'),
];
const weapons = [
  () => import('../generated/weapons-0.json'),
  () => import('../generated/weapons-1.json'),
  () => import('../generated/weapons-2.json'),
  () => import('../generated/weapons-3.json'),
  () => import('../generated/weapons-4.json'),
  () => import('../generated/weapons-5.json'),
  () => import('../generated/weapons-6.json'),
];
const sets = [
  () => import('../generated/sets-0.json'),
  () => import('../generated/sets-1.json'),
  () => import('../generated/sets-2.json'),
];

export async function loadCatalog(): Promise<GameCatalog> {
  return clone((await import('../generated/catalog.json')).default as GameCatalog);
}
export async function getCharacter(id: string): Promise<CharacterDefinition> {
  const index = (await loadCatalog()).characters.findIndex(entry => entry.id === id);
  if (index < 0) throw new Error('角色资料不存在，请重新选择。');
  const entries = (await characters[Math.floor(index / 10)]()).default as CharacterDefinition[];
  return clone(entries[index % 10]);
}
export async function getWeapon(id: string): Promise<WeaponDefinition> {
  const index = (await loadCatalog()).weapons.findIndex(entry => entry.id === id);
  if (index < 0) throw new Error('武器资料不存在，请重新选择。');
  const entries = (await weapons[Math.floor(index / 40)]()).default as WeaponDefinition[];
  return clone(entries[index % 40]);
}
export async function getArtifactSet(id: string): Promise<ArtifactSetDefinition> {
  const index = (await loadCatalog()).sets.findIndex(entry => entry.id === id);
  if (index < 0) throw new Error('套装资料不存在，请重新选择。');
  const entries = (await sets[Math.floor(index / 30)]()).default as ArtifactSetDefinition[];
  return clone(entries[index % 30]);
}
export async function getArtifactMain(): Promise<Record<StatKey, number[]>> {
  return clone((await import('../generated/artifact-main.json')).default as Record<StatKey, number[]>);
}
export async function getReactionRules(): Promise<ReactionRules> {
  return clone((await import('../generated/reactions.json')).default as ReactionRules);
}
