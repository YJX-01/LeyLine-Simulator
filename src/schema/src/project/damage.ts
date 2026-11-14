import { z } from 'zod';
import { idSchema } from '../common/values';
import { hitReactionSchema } from '../content/reactions';
import { combatConditionsSchema } from './combat-conditions';
import { combatStateOverrideSchema } from './combat-state';

export const damageRequestSchema = z.object({ skillId: idSchema, hitIndex: z.number().int().nonnegative().max(29), crit: z.enum(['critical', 'noncritical', 'expected']).nullable(), reaction: z.union([z.literal('none'), hitReactionSchema]).nullable(), conditions: combatConditionsSchema.optional(), stateOverrides: z.array(combatStateOverrideSchema).max(100).optional(),
  capture: z.object({ recordId: idSchema.nullable(), phase: z.enum(['before', 'after']).nullable() }).strict().optional(),
  inputs: z.record(idSchema, z.number().finite().nullable()).refine(values => Object.keys(values).length <= 20, '命中输入不得超过20项。').optional(),
  effectApplications: z.array(z.object({ instanceId: z.string().min(1).max(2000), active: z.boolean().nullable() }).strict()).max(1000)
    .refine(applications => new Set(applications.map(application => application.instanceId)).size === applications.length, '同一命中不能重复声明相同效果实例。').optional(),
}).strict();

export type DamageRequest = z.infer<typeof damageRequestSchema>;
