import { z } from 'zod';
export const elements = ['physical', 'anemo', 'geo', 'electro', 'hydro', 'pyro', 'cryo', 'dendro'] as const;
export const statKeys = ['hp', 'hpPercent', 'attack', 'attackPercent', 'defense', 'defensePercent', 'critRate', 'critDamage', 'energyRecharge', 'elementalMastery', 'physicalBonus', 'anemoBonus', 'geoBonus', 'electroBonus', 'hydroBonus', 'pyroBonus', 'cryoBonus', 'dendroBonus', 'healingBonus'] as const;
export const statSchema = z.enum(statKeys);
export type StatKey = z.infer<typeof statSchema>;
export type Element = typeof elements[number];
