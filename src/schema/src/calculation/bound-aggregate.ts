import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { boundFormulaSchema, calculationBindingSchema } from './binding';
import { combatFrameSchema } from './context';
import { calculationValueSchema, definitionRefSchema } from './values';

const independentBinding = z.object({ contributorId: idSchema, fact: idSchema, yes: calculationValueSchema, no: calculationValueSchema }).strict();
const jointBinding = z.object({ contributorId: idSchema, fact: idSchema, value: calculationValueSchema }).strict();
export const boundAggregateRequestSchema = z.object({
  definition: definitionRefSchema,
  contributors: z.array(z.object({
    id: idSchema, qualified: z.boolean().nullable(), invocation: boundFormulaSchema, frame: combatFrameSchema,
    rankFrame: combatFrameSchema.optional(),
  }).strict()).min(1).max(1000),
  probability: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('fixed') }).strict(),
    z.object({ kind: z.literal('independent'), variables: z.array(z.object({
      id: idSchema, probability: z.object({ kind: z.enum(['probability', 'crit-rate']), contributorId: idSchema, binding: calculationBindingSchema }).strict().nullable(),
      bindings: z.array(independentBinding).min(1).max(1000),
    }).strict()).max(1000) }).strict(),
    z.object({ kind: z.literal('joint'), states: z.array(z.object({
      id: idSchema, probability: finiteSchema.min(0).max(1), bindings: z.array(jointBinding).max(10000),
    }).strict()).min(1).max(256) }).strict(),
  ]),
}).strict().superRefine((request, validation) => {
  const ids = new Set(request.contributors.map(contributor => contributor.id)), first = request.contributors[0].frame;
  if (ids.size !== request.contributors.length) validation.addIssue({ code: 'custom', path: ['contributors'], message: '贡献者身份重复。' });
  for (const [index, contributor] of request.contributors.entries()) for (const frame of [contributor.frame, ...contributor.rankFrame ? [contributor.rankFrame] : []]) {
    if (frame.ownerId !== contributor.id || frame.recipientId !== contributor.id || frame.contributorId !== contributor.id
      || frame.eventId !== first.eventId || frame.targetId !== first.targetId || frame.phase !== first.phase) {
      validation.addIssue({ code: 'custom', path: ['contributors', index, 'frame'], message: '贡献者须读取自己的配装，并共享事件、目标和阶段。' });
    }
  }
  if (request.probability.kind === 'independent') for (const [index, variable] of request.probability.variables.entries()) {
    if (variable.probability && !ids.has(variable.probability.contributorId)) validation.addIssue({ code: 'custom', path: ['probability', 'variables', index], message: '概率读取引用了不存在的贡献者。' });
  }
});
export type BoundAggregateRequest = z.infer<typeof boundAggregateRequestSchema>;
