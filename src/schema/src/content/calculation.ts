import { z } from 'zod';
import { calculationBundleSchema } from '../calculation/bundle';
import { definitionKey, definitionRefSchema } from '../calculation/values';
import { reactionRulesSchema } from './reactions';
import { contentSourceSchema, idSchema } from '../common/values';
import { elements, statSchema } from './stats';
import { boundFormulaSchema, calculationBindingSchema } from '../calculation/binding';

export const structuredHitSchema = z.object({
  id: idSchema, element: z.enum(elements), category: z.enum(['normal', 'charged', 'plunge', 'skill', 'burst']),
  parameter: idSchema.optional(),
  snapshot: z.object({ sourceSkillId: idSchema, attributes: z.array(statSchema).min(1).max(30), source: contentSourceSchema.optional() }).strict().optional(),
  base: boundFormulaSchema, sources: z.array(idSchema).min(1).max(1000),
  outputs: z.array(z.object({ id: idSchema, family: idSchema, origin: z.enum(['talent', 'triggered']), invocation: boundFormulaSchema,
    coverageRefs: z.array(definitionRefSchema).min(1).max(1000) }).strict()).max(1000),
  coverageRefs: z.array(definitionRefSchema).min(1).max(1000),
}).strict();

/** Authored definitions may reference shared libraries; compilation checks the assembled graph. */
export const contentCalculationSchema = z.object({
  bundle: calculationBundleSchema,
  ruleIds: z.array(definitionRefSchema).max(1000),
}).strict().superRefine((profile, context) => {
  const effects = new Set(profile.bundle.effects.map(effect => definitionKey(effect.identity)));
  if (new Set(profile.ruleIds.map(definitionKey)).size !== profile.ruleIds.length
    || profile.ruleIds.some(reference => !effects.has(definitionKey(reference)))) {
    context.addIssue({ code: 'custom', path: ['ruleIds'], message: '实体规则必须唯一并引用本文件拥有的效果。' });
  }
});

export const characterCalculationSchema = contentCalculationSchema.safeExtend({
  hitTemplates: z.array(z.object({ identity: definitionRefSchema, formula: definitionRefSchema, bindings: z.record(idSchema, calculationBindingSchema),
    baseInput: idSchema, output: idSchema, captures: boundFormulaSchema.shape.captures }).strict()).max(1000).optional(),
  hits: z.array(z.object({ skillId: idSchema, hit: structuredHitSchema.omit({ outputs: true }).extend({
    base: boundFormulaSchema.omit({ predicate: true }),
    outputs: z.array(z.object({ id: idSchema, family: idSchema, origin: z.enum(['talent', 'triggered']), template: definitionRefSchema,
      predicate: calculationBindingSchema.optional(), coverageRefs: z.array(definitionRefSchema).min(1).max(1000) }).strict()).max(1000),
  }) }).strict()).max(1000).optional(),
  contextCoverageRefs: z.array(definitionRefSchema).min(1).max(1000).optional(),
}).superRefine((profile, context) => {
  const ids = profile.hits?.map(entry => entry.hit.id) ?? [];
  if (new Set(ids).size !== ids.length) context.addIssue({ code: 'custom', path: ['hits'], message: '角色拥有的命中身份重复。' });
  const templates = new Set(profile.hitTemplates?.map(template => definitionKey(template.identity)) ?? []);
  if (templates.size !== (profile.hitTemplates?.length ?? 0)) context.addIssue({ code: 'custom', path: ['hitTemplates'], message: '命中绑定模板身份重复。' });
  for (const [index, template] of (profile.hitTemplates ?? []).entries()) if (Object.hasOwn(template.bindings, template.baseInput)) context.addIssue({ code: 'custom', path: ['hitTemplates', index, 'bindings'], message: '命中基数不得与共同绑定重复提供。' });
  for (const [index, entry] of (profile.hits ?? []).entries()) for (const output of entry.hit.outputs) if (!templates.has(definitionKey(output.template))) context.addIssue({ code: 'custom', path: ['hits', index], message: '命中缺少绑定模板的精确版本。' });
});

export const reactionLibrarySchema = z.object({
  rules: reactionRulesSchema,
  calculation: calculationBundleSchema,
}).strict();
