import { z } from 'zod';
import { idSchema } from '../common/values';
import { definitionRefSchema } from './values';

export const coverageImpactSchema = z.object({
  recipient: z.enum(['owner', 'team']).optional(),
  attributes: z.array(idSchema).min(1).max(1000).optional(),
  families: z.array(idSchema).min(1).max(1000).optional(),
}).strict();

/** A certificate describes one explicit output scope, never combat execution as a whole. */
export const calculationCoverageRecordSchema = z.object({
  identity: definitionRefSchema, entity: definitionRefSchema,
  scope: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('hit'), skillId: idSchema, hitId: idSchema, maxConstellation: z.number().int().min(0).max(6) }).strict(),
    z.object({ kind: z.literal('context'), maxConstellation: z.number().int().min(0).max(6) }).strict(),
    z.object({ kind: z.literal('equipment'), pieces: z.number().int().min(1).max(5).optional() }).strict(),
  ]),
  resolution: z.enum(['complete', 'unavailable']), evidence: z.enum(['declared', 'adopted', 'independently-checked', 'observed']),
  reason: z.string().min(1).max(4000), sources: z.array(idSchema).min(1).max(1000),
  mechanisms: z.array(z.object({ id: idSchema, resolution: z.enum(['implemented', 'irrelevant', 'unavailable']),
    ruleIds: z.array(definitionRefSchema).max(1000), reason: z.string().min(1).max(2000), impact: coverageImpactSchema.optional() }).strict()).min(1).max(1000),
}).strict().superRefine((record, validation) => {
  if (new Set(record.mechanisms.map(mechanism => mechanism.id)).size !== record.mechanisms.length) validation.addIssue({ code: 'custom', path: ['mechanisms'], message: '机制身份重复。' });
  if (record.resolution === 'complete' && record.mechanisms.some(mechanism => mechanism.resolution === 'unavailable')) validation.addIssue({ code: 'custom', path: ['resolution'], message: '完整覆盖不得包含未实现机制。' });
});
export type CalculationCoverageRecord = z.infer<typeof calculationCoverageRecordSchema>;
