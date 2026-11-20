import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { idSchema } from '../common/values';
import { calculatorProjectSchema } from '../project/project';

export const damageCalculatorSchema = z.object({
  schemaVersion: z.literal(APP_VERSION),
  kind: z.literal('damage-calculator'),
  team: z.object({ id: idSchema, name: z.string().trim().min(1).max(160) }).strict().optional(),
  project: calculatorProjectSchema,
  baseline: calculatorProjectSchema.optional(),
  actorId: idSchema,
  recordId: idSchema.optional(),
}).strict().superRefine((document, context) => {
  if (!document.project.candidate.actors.some(actor => actor.id === document.actorId && actor.build)) {
    context.addIssue({ code: 'custom', message: '计算器选定队员的配装缺失。' });
  }
  if (document.recordId && !document.project.timeline.some(record => record.id === document.recordId && record.kind === 'damage')) {
    context.addIssue({ code: 'custom', message: '计算器选定命中不存在。' });
  }
});
export type DamageCalculatorDocument = z.infer<typeof damageCalculatorSchema>;
