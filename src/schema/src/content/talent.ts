import { z } from 'zod';
import { idSchema, finiteSchema, supportSchema, contentSourceSchema } from '../common/values';
import { elements, statSchema } from './stats';
import { attackTypeSchema } from './effects';
import { combatRulesSchema } from './combat-rules';
export const damageScalingStatSchema = z.enum(['attack', 'hp', 'defense', 'elementalMastery']);
export type DamageScalingStat = z.infer<typeof damageScalingStatSchema>;
export const damageHitSchema = z.object({
  parameter: idSchema,
  scalingStat: damageScalingStatSchema.optional(),
  additionalScaling: z.array(z.object({ stat: damageScalingStatSchema, parameter: idSchema, count: idSchema.optional() }).strict()).max(8).optional(),
  element: z.enum(elements).optional(),
  category: attackTypeSchema.optional(),
  snapshot: z.object({
    sourceSkillId: idSchema,
    attributes: z.array(statSchema).min(1).max(30).refine(attributes => new Set(attributes).size === attributes.length, '捕获属性不得重复。'),
    source: contentSourceSchema,
  }).strict().optional(),
}).strict();
export const parameterSchema = z.object({ id: idSchema, unit: z.enum(['ratio','scalar','seconds','energy','stamina','unknown']), values: z.array(finiteSchema).min(1).max(30) }).strict();
const talentInputSchema = z.object({
  id: idSchema, min: finiteSchema.nonnegative(), max: finiteSchema.nonnegative(), integer: z.boolean(), source: contentSourceSchema,
  constellationLimits: z.array(z.object({ rank: z.number().int().min(1).max(6), max: finiteSchema.nonnegative(), source: contentSourceSchema }).strict()).max(6).optional(),
}).strict().refine(input => input.max >= input.min && (!input.integer || (Number.isInteger(input.min) && Number.isInteger(input.max)))
  && (input.constellationLimits ?? []).every(limit => limit.max >= input.min && (!input.integer || Number.isInteger(limit.max)))
  && new Set(input.constellationLimits?.map(limit => limit.rank)).size === (input.constellationLimits ?? []).length, '技能输入范围无效。');
export const talentSchema = z.object({ id: idSchema, name: idSchema, description: z.string().max(40000), flavorText: z.string().max(10000).optional(),
  category: z.enum(['normal','skill','burst']), element: z.enum(elements),
  parameters: z.array(parameterSchema).max(100), details: z.array(z.object({ label: z.string().max(500), template: z.string().max(2000) }).strict()).max(100),
  inputs: z.array(talentInputSchema).max(20).optional(),
  hits: z.array(damageHitSchema).max(30), noIndependentDamage: z.literal(true).optional(), support: supportSchema,
}).strict().superRefine((talent, context) => {
  const ids = new Set(talent.parameters.map(parameter => parameter.id));
  if (ids.size !== talent.parameters.length) context.addIssue({ code:'custom', message:'技能参数标识重复。', path:['parameters'] });
  const inputIds = new Set((talent.inputs ?? []).map(input => input.id));
  if (inputIds.size !== (talent.inputs ?? []).length) context.addIssue({ code: 'custom', message: '技能输入标识重复。', path: ['inputs'] });
  if (talent.support.supported && !talent.hits.length && !talent.noIndependentDamage) context.addIssue({ code:'custom', message:'已支持技能须声明命中或明确无独立伤害。', path:['hits'] });
  if (talent.noIndependentDamage && talent.hits.length) context.addIssue({ code:'custom', message:'无独立伤害的技能不能声明伤害命中。', path:['hits'] });
  for (const [index, hit] of talent.hits.entries()) {
    const references = [hit.parameter, ...(hit.additionalScaling ?? []).map(term => term.parameter)];
    if (references.some(reference => !ids.has(reference))) context.addIssue({ code:'custom',message:'命中引用了不存在的参数。',path:['hits',index] });
    if (hit.additionalScaling?.some(term => term.count && !inputIds.has(term.count))) context.addIssue({ code: 'custom', message: '命中引用了未声明的技能输入。', path: ['hits', index] });
  }
});
export const passiveSchema = z.object({ id: idSchema, name: idSchema, description: z.string().max(40000), unlockAscension:z.number().int().min(0).max(6).nullable(), support:supportSchema, combatRules: combatRulesSchema.optional() }).strict();
export const constellationSchema = z.object({ rank:z.number().int().min(1).max(6), name:idSchema, description:z.string().max(40000),
  talentBonuses:z.array(z.object({category:z.enum(['normal','skill','burst']),levels:z.literal(3)}).strict()).max(3), support:supportSchema, combatRules: combatRulesSchema.optional() }).strict();
export type Talent = z.infer<typeof talentSchema>;

/** Missing values stay unknown; supplied values must belong to this talent's source-declared range. */
export function talentInputIssues(talent: Talent, values: Record<string, number | null> = {}, constellation = 0): string[] {
  return Object.entries(values).flatMap(([id, value]) => {
    const input = talent.inputs?.find(input => input.id === id);
    if (!input) return [`技能未声明此命中输入：${id}`];
    const limit = input.constellationLimits?.filter(limit => limit.rank <= constellation).reduce<{ rank: number; max: number }>(
      (current, limit) => limit.rank > current.rank ? limit : current, { rank: 0, max: input.max });
    return value !== null && (!Number.isFinite(value) || value < input.min || value > (limit?.max ?? input.max) || (input.integer && !Number.isInteger(value)))
      ? [`命中输入超出技能声明范围或整数要求：${id}`] : [];
  });
}

export function talentLevelBonus(character: { constellations: { rank: number; talentBonuses: { category: Talent['category']; levels: number }[] }[] }, category: Talent['category'], constellation: number): number {
  return character.constellations.filter(item => item.rank <= constellation).flatMap(item => item.talentBonuses)
    .filter(item => item.category === category).reduce((total, item) => total + item.levels, 0);
}
