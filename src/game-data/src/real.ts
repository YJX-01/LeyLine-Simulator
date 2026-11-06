/** Fixed, independently generated game snapshots. No runtime reference checkout dependency. */
export const REAL_DATA_VERSION = 'genshin-db-8e5badd-real-v1';
export type RealElement = 'physical' | 'anemo' | 'geo' | 'electro' | 'hydro' | 'pyro' | 'cryo' | 'dendro';
export type RealStat = 'hp' | 'hpPercent' | 'attack' | 'attackPercent' | 'defense' | 'defensePercent' | 'critRate' | 'critDamage' | 'energyRecharge' | 'elementalMastery' | 'physicalBonus' | 'anemoBonus' | 'geoBonus' | 'electroBonus' | 'hydroBonus' | 'pyroBonus' | 'cryoBonus' | 'dendroBonus' | 'healingBonus';
export interface RealSource { repository: string; commit: string; path: string }
export interface RealSupport { supported: boolean; reason: string }
export interface RealModifier { stat: RealStat; values: number[]; category?: 'normal' | 'skill' | 'burst'; minAscension?: number; hpAbove?: number }
export interface RealCharacter {
  id: string; name: string; element: RealElement; weaponType: string;
  base: { hp: number; attack: number; defense: number; critRate: number; critDamage: number };
  curves: { hp: number[]; attack: number[]; defense: number[] };
  specialized: RealStat;
  promotion: { maxLevel: number; hp: number; attack: number; defense: number; specialized: number }[];
  skills: { id: string; name: string; category: 'normal' | 'skill' | 'burst'; element: RealElement; multipliers: number[][]; support: RealSupport }[];
  modifiers: RealModifier[]; support: RealSupport; source: RealSource;
}
export interface RealWeapon {
  id: string; name: string; weaponType: string; rarity: number; baseAttack: number; baseStat: number; stat: RealStat;
  attackCurve: number[]; statCurve: number[]; promotion: number[]; modifiers: RealModifier[]; support: RealSupport; source: RealSource;
}
export interface RealSet { id: string; name: string; effects: { pieces: number; modifiers: RealModifier[]; support: RealSupport }[]; source: RealSource }
export interface RealCatalog {
  version: string;
  characters: { id: string; name: string; element: RealElement; weaponType: string; supported: boolean; reason: string }[];
  weapons: { id: string; name: string; weaponType: string; rarity: number; supported: boolean; reason: string }[];
  sets: { id: string; name: string }[];
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const characters = [
  () => import('./real-data/characters-0.json'),
  () => import('./real-data/characters-1.json'),
  () => import('./real-data/characters-2.json'),
  () => import('./real-data/characters-3.json'),
  () => import('./real-data/characters-4.json'),
  () => import('./real-data/characters-5.json'),
  () => import('./real-data/characters-6.json'),
  () => import('./real-data/characters-7.json'),
  () => import('./real-data/characters-8.json'),
  () => import('./real-data/characters-9.json'),
  () => import('./real-data/characters-10.json'),
  () => import('./real-data/characters-11.json'),
  () => import('./real-data/characters-12.json'),
];
const weapons = [
  () => import('./real-data/weapons-0.json'),
  () => import('./real-data/weapons-1.json'),
  () => import('./real-data/weapons-2.json'),
  () => import('./real-data/weapons-3.json'),
  () => import('./real-data/weapons-4.json'),
  () => import('./real-data/weapons-5.json'),
  () => import('./real-data/weapons-6.json'),
];
const sets = [
  () => import('./real-data/sets-0.json'),
  () => import('./real-data/sets-1.json'),
  () => import('./real-data/sets-2.json'),
];

export async function loadRealCatalog(): Promise<RealCatalog> {
  return clone((await import('./real-data/catalog.json')).default as RealCatalog);
}
export async function getRealCharacter(id: string): Promise<RealCharacter> {
  const index = (await loadRealCatalog()).characters.findIndex(entry => entry.id === id);
  if (index < 0) throw new Error('角色资料不存在，请重新选择。');
  const entries = (await characters[Math.floor(index / 10)]()).default as RealCharacter[];
  return clone(entries[index % 10]);
}
export async function getRealWeapon(id: string): Promise<RealWeapon> {
  const index = (await loadRealCatalog()).weapons.findIndex(entry => entry.id === id);
  if (index < 0) throw new Error('武器资料不存在，请重新选择。');
  const entries = (await weapons[Math.floor(index / 40)]()).default as RealWeapon[];
  return clone(entries[index % 40]);
}
export async function getRealSet(id: string): Promise<RealSet> {
  const index = (await loadRealCatalog()).sets.findIndex(entry => entry.id === id);
  if (index < 0) throw new Error('套装资料不存在，请重新选择。');
  const entries = (await sets[Math.floor(index / 30)]()).default as RealSet[];
  return clone(entries[index % 30]);
}
export async function getArtifactMain(): Promise<Record<RealStat, number[]>> {
  return clone((await import('./real-data/artifact-main.json')).default as Record<RealStat, number[]>);
}
