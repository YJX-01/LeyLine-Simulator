import { z } from 'zod';
import { finiteSchema } from '../common/values';

/** Conditions chosen for a damage point, independent of cultivation and inventory. */
export const combatConditionsSchema = z.object({
  hpRatio: finiteSchema.min(0).max(1).nullable().optional(),
  onField: z.boolean().nullable().optional(),
  shielded: z.boolean().nullable().optional(),
}).strict();

export type CombatConditions = z.infer<typeof combatConditionsSchema>;
