import { z } from 'zod';
import { idSchema, finiteSchema } from '../common/values';
import { elements } from '../content/stats';
import { calculationFactSchema } from '../calculation/binding';
import { damageRequestSchema } from './damage';

export const aggregateReactionFamilies = ['lunar-charged', 'lunar-crystallize', 'stellar-swirl'] as const;
export const projectReactionSchema = z.object({
  family: z.enum(aggregateReactionFamilies),
  element: z.enum(elements),
  coefficient: finiteSchema.nonnegative().nullable().optional(),
  contributors: z.array(z.object({
    actorId: idSchema,
    qualified: z.boolean().nullable(),
    crit: damageRequestSchema.shape.crit,
    facts: z.record(idSchema, calculationFactSchema).optional(),
  }).strict()).min(1).max(4),
  jointCrit: z.array(z.object({ id: idSchema, probability: finiteSchema.min(0).max(1), critical: z.record(idSchema, z.boolean()) }).strict()).min(1).max(256).optional(),
}).strict().superRefine((reaction, context) => {
  const contributors = reaction.contributors.map(contributor => contributor.actorId);
  if (new Set(contributors).size !== contributors.length) context.addIssue({ code: 'custom', path: ['contributors'], message: '参与队员不得重复。' });
  if (reaction.family !== 'stellar-swirl' && reaction.coefficient !== undefined) context.addIssue({ code: 'custom', path: ['coefficient'], message: '此反应使用固定系数。' });
  if (reaction.family === 'lunar-charged' && reaction.element !== 'electro' || reaction.family === 'lunar-crystallize' && reaction.element !== 'geo') {
    context.addIssue({ code: 'custom', path: ['element'], message: '伤害元素与月曜反应不符。' });
  }
  const expected = reaction.contributors.filter(contributor => contributor.crit === 'expected').map(contributor => contributor.actorId);
  for (const [index, state] of (reaction.jointCrit ?? []).entries()) {
    if (Object.keys(state.critical).length !== expected.length || expected.some(id => !Object.hasOwn(state.critical, id))) {
      context.addIssue({ code: 'custom', path: ['jointCrit', index, 'critical'], message: '联合概率状态须明确填写每位采用期望口径的队员。' });
    }
  }
});
export type ProjectReaction = z.infer<typeof projectReactionSchema>;
