import { z } from 'zod';
import { finiteSchema } from '../common/values';
import { statSchema, type StatKey } from './stats';

export const artifactRaritySchema = z.union([z.literal(4), z.literal(5)]);
export type ArtifactRarity = z.infer<typeof artifactRaritySchema>;
export const artifactSlotSchema = z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']);
export const artifactMaxLevel = (rarity: ArtifactRarity): number => rarity === 4 ? 16 : 20;
export const artifactInitialSubstatCounts = (rarity: ArtifactRarity): readonly number[] => rarity === 4 ? [2, 3] : [3, 4];
export const artifactMainTableSchema = z.object({
  '4': z.record(statSchema, z.array(finiteSchema.nonnegative()).length(17)),
  '5': z.record(statSchema, z.array(finiteSchema.nonnegative()).length(21)),
}).strict();
export type ArtifactMainTable = z.infer<typeof artifactMainTableSchema>;

// Conservative display bounds, independently checked against adopted rarity-specific affixes.
// These are input limits; exact roll decompositions remain distinct from observed history.
export const artifactSubstatLimits: Record<ArtifactRarity, Partial<Record<StatKey, number>>> = {
  4: { hp: 957, attack: 63, defense: 75, hpPercent: 0.187, attackPercent: 0.187, defensePercent: 0.234, energyRecharge: 0.208, elementalMastery: 75, critRate: 0.125, critDamage: 0.249 },
  5: { hp: 1793, attack: 117, defense: 139, hpPercent: 0.35, attackPercent: 0.35, defensePercent: 0.44, energyRecharge: 0.4, elementalMastery: 140, critRate: 0.24, critDamage: 0.48 },
};
