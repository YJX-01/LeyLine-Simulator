import { z } from 'zod';
import { finiteSchema, idSchema, quantityUnitSchema, type QuantityUnit } from '../common/values';
import { teamCountSchema } from '../calculation/binding';

export type CombatExpression = number | { amount: number; unit: QuantityUnit } | { refinement: number[]; unit: QuantityUnit } | { stat: string; actor?: 'owner' | 'recipient' | 'contributor'; excludeCurrentEffect?: true } | { state: 'ascension' | 'constellation' | 'refinement' }
  | { parameter: string; skill: string; unit?: QuantityUnit } | { fact: string; of?: 'owner' | 'recipient' | 'event-actor'; at?: 'source-event' | 'last-observation' } | { teamStat: 'elementalMastery' | 'energyCapacity'; aggregate: 'max' | 'sum' }
  | { teamCount: z.infer<typeof teamCountSchema> }
  | { teamRegion: string }
  | { call: string; inputs: Record<string, CombatExpression>; output?: string };
export const combatExpressionSchema: z.ZodType<CombatExpression> = z.lazy(() => z.union([finiteSchema,
  z.object({ amount: finiteSchema, unit: quantityUnitSchema }).strict(), z.object({ refinement: z.array(finiteSchema).length(5), unit: quantityUnitSchema }).strict(),
  z.object({ stat: idSchema, actor: z.enum(['owner', 'recipient', 'contributor']).optional(), excludeCurrentEffect: z.literal(true).optional() }).strict(),
  z.object({ state: z.enum(['ascension', 'constellation', 'refinement']) }).strict(),
  z.object({ parameter: idSchema, skill: idSchema, unit: quantityUnitSchema.optional() }).strict(), z.object({ fact: idSchema, of: z.enum(['owner','recipient','event-actor']).optional(), at: z.enum(['source-event','last-observation']).optional() }).strict(),
  z.object({ teamStat: z.enum(['elementalMastery','energyCapacity']), aggregate: z.enum(['max','sum']) }).strict(),
  z.object({ teamCount: teamCountSchema }).strict(),
  z.object({teamRegion:idSchema}).strict(),
  z.object({ call: idSchema, inputs: z.record(idSchema, combatExpressionSchema), output: idSchema.optional() }).strict(),
]));
