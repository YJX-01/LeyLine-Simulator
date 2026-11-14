import { z } from 'zod';
import { idSchema } from '../common/values';
import { projectSchema } from '../project/project';

export const damageCalculatorSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal('damage-calculator'),
  project: projectSchema,
  baseline: projectSchema.optional(),
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
