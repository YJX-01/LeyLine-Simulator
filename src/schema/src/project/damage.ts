import { hitRefSchema } from '../content/hit-ref';
import { z } from 'zod';
import { idSchema } from '../common/values';
import { hitReactionSchema } from '../content/reactions';
import { hitFactsSchema } from './hit-facts';

export const damageRequestSchema = z.object({ hit: hitRefSchema, crit: z.enum(['critical', 'noncritical', 'expected']).nullable(), reaction: z.union([z.literal('none'), hitReactionSchema]).nullable(), facts: hitFactsSchema.optional(),
  capture: z.object({ recordId: idSchema.nullable(), phase: z.enum(['before', 'after']).nullable() }).strict().optional(),
  effectApplications: z.array(z.object({ instanceId: z.string().min(1).max(2000), active: z.boolean().nullable() }).strict()).max(1000)
    .refine(applications => new Set(applications.map(application => application.instanceId)).size === applications.length, '同一命中不能重复声明相同效果实例。').optional(),
}).strict();

export type DamageRequest = z.infer<typeof damageRequestSchema>;
