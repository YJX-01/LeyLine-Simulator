export { structuredWeaponDefinitionSchema as weaponDefinitionSchema } from './structured-content';
export type { StructuredWeaponDefinition as WeaponDefinition } from './structured-content';

export function weaponRefinementLimit(weapon: { rarity: number; maxRefinement?: number }) {
  return weapon.maxRefinement ?? (weapon.rarity < 3 ? 1 : 5);
}
