import { z } from 'zod';
import { finiteSchema, idSchema, quantityUnitSchema, type QuantityUnit } from '../common/values';
import { sourceAttributeTimeSchema, teamCountSchema } from '../calculation/binding';

export type CombatExpression = number | { amount: number; unit: QuantityUnit } | { refinement: number[]; unit: QuantityUnit }
  | { stat: string; actor?: 'owner' | 'recipient' | 'contributor'; at?: z.infer<typeof sourceAttributeTimeSchema>;
    excludeCurrentEffect?: true; excludeExtraAttack?: true; excludeOwnerBuffs?: string[]; excludeNonConvertible?: true }
  | { state: 'ascension' | 'constellation' | 'refinement' }
  | { parameter: string; skill: string; unit?: QuantityUnit } | { fact: string; of?: 'owner' | 'recipient' | 'event-actor'; at?: 'source-event' | 'last-observation' }
  | { teamStat: 'elementalMastery' | 'energyCapacity'; aggregate: 'max' | 'sum'; at?: z.infer<typeof sourceAttributeTimeSchema>; excludeNonConvertible?: true }
  | { teamCount: z.infer<typeof teamCountSchema> }
  | { teamRegion: string; excludeOwner?: true; match?: 'exclude' }
  | { call: string; inputs: Record<string, CombatExpression>; output?: string };
export const combatExpressionSchema: z.ZodType<CombatExpression> = z.lazy(() => z.union([finiteSchema,
  z.object({ amount: finiteSchema, unit: quantityUnitSchema }).strict(), z.object({ refinement: z.array(finiteSchema).length(5), unit: quantityUnitSchema }).strict(),
  z.object({ stat: idSchema, actor: z.enum(['owner', 'recipient', 'contributor']).optional(),
    at: sourceAttributeTimeSchema.optional(), excludeCurrentEffect: z.literal(true).optional(),
    excludeExtraAttack: z.literal(true).optional(), excludeOwnerBuffs: z.array(idSchema).min(1).max(32).optional(), excludeNonConvertible: z.literal(true).optional() }).strict()
    .refine(read => !read.excludeNonConvertible || ['elementalMastery','energyRecharge'].includes(read.stat), '排除不可转化来源只适用于精通和充能效率。')
    .refine(read => !read.excludeExtraAttack || read.stat === 'attack', '非额外攻击力须读取攻击力属性。'),
  z.object({ state: z.enum(['ascension', 'constellation', 'refinement']) }).strict(),
  z.object({ parameter: idSchema, skill: idSchema, unit: quantityUnitSchema.optional() }).strict(), z.object({ fact: idSchema, of: z.enum(['owner','recipient','event-actor']).optional(), at: z.enum(['source-event','last-observation']).optional() }).strict(),
  z.object({ teamStat: z.enum(['elementalMastery','energyCapacity']), aggregate: z.enum(['max','sum']),
    at: sourceAttributeTimeSchema.optional(), excludeNonConvertible: z.literal(true).optional() }).strict()
    .refine(read => !read.excludeNonConvertible || read.teamStat === 'elementalMastery', '只有队伍元素精通可按转化来源筛选。'),
  z.object({ teamCount: teamCountSchema }).strict(),
  z.object({teamRegion:idSchema, excludeOwner:z.literal(true).optional(), match:z.literal('exclude').optional()}).strict(),
  z.object({ call: idSchema, inputs: z.record(idSchema, combatExpressionSchema), output: idSchema.optional() }).strict(),
]));
