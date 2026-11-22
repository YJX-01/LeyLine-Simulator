import { z } from 'zod';
import { combatExpressionSchema } from './combat-expression';
import { idSchema, finiteSchema } from '../common/values';
import { elements } from './stats';
import { calculationQuantityTypeSchema } from '../calculation/values';
import type { CharacterMetadata } from './character-metadata';
export const damageScalingStatSchema = z.enum(['attack', 'hp', 'defense', 'elementalMastery']);
export type DamageScalingStat = z.infer<typeof damageScalingStatSchema>;
export const parameterSchema = z.object({ id: idSchema, unit: z.enum(['ratio','scalar','seconds','energy','stamina','staminaPerSecond','pointsPerSecond','hp','attack','defense','elementalMastery','count','unknown']), values: z.array(finiteSchema).min(1).max(30) }).strict();
export const talentInputSchema = z.object({
  id: idSchema, type: calculationQuantityTypeSchema, min: finiteSchema.nonnegative(), max: finiteSchema.nonnegative(), integer: z.boolean(),
  constellationLimits: z.array(z.object({ rank: z.number().int().min(1).max(6), max: finiteSchema.nonnegative() }).strict()).max(6).optional(),
}).strict().refine(input => input.max >= input.min && (!input.integer || (Number.isInteger(input.min) && Number.isInteger(input.max)))
  && (input.constellationLimits ?? []).every(limit => limit.max >= input.min && (!input.integer || Number.isInteger(limit.max)))
  && new Set(input.constellationLimits?.map(limit => limit.rank)).size === (input.constellationLimits ?? []).length, '技能输入范围无效。');
const frames = z.number().int().nonnegative().max(36000);
export const linkedSummonSchema = z.object({
  durationParameter: idSchema, capacity: z.number().int().min(1).max(8), rankHits: z.array(idSchema).min(1).max(10),
  extraRankAt: z.number().int().min(1).max(6), fps: z.number().int().min(1).max(240), spawn: frames, firstShot: frames,
  interval: frames.min(1), impactDelay: frames, release: z.object({ skill: idSchema, hit: idSchema, additionalHit: idSchema,
    impact: frames, firstAdditional: frames, spacing: frames }).strict(),
}).strict();
export const talentFieldsSchema = z.object({ id: idSchema, name: idSchema, description: z.string().max(40000), flavorText: z.string().max(10000).optional(),
  category: z.enum(['normal','skill','burst']), element: z.enum(elements),
  energyCapacity: z.union([z.literal(0), z.object({ parameter: idSchema }).strict()]).optional(),
  cooldownParameter: idSchema.optional(),
  skillCharges: z.number().int().min(1).max(10).optional(),
  castWindow: z.object({ fact:idSchema, durationParameter:idSchema, cancelOnLeave:z.boolean(), cancelOnDefeat:z.literal(true).optional(), exit:z.object({hit:idSchema,ready:idSchema}).strict().optional(),
    followUp:z.object({triggers:z.array(idSchema).min(1).max(30),hit:idSchema,ready:idSchema,recordedHits:z.number().int().min(1).max(30)}).strict().optional(),
    hitCounter:z.object({input:idSchema,hits:z.array(idSchema).min(1),intervalMs:z.number().int().nonnegative(),ascension:z.object({rank:z.number().int().min(1).max(6),initial:z.number().int().nonnegative(),fillHit:idSchema}).strict()}).strict().optional(),
    contact:z.object({hit:idSchema,ready:idSchema,intervalMs:z.number().int().positive()}).strict().optional() }).strict().optional(),
  parameters: z.array(parameterSchema).max(100), details: z.array(z.object({ label: z.string().max(500), template: z.string().max(2000) }).strict()).max(100),
  heals: z.array(z.object({ id: idSchema, detail: z.number().int().nonnegative(), stat: damageScalingStatSchema,
    rate: idSchema, flat: idSchema.optional(), recipient: z.enum(['self', 'other', 'party', 'on-field']),
    condition: combatExpressionSchema.optional(), count: z.object({ fact: idSchema, cap: z.number().int().positive().optional() }).strict().optional(),
    trigger: z.literal('cast').optional() }).strict()
    .refine(heal => !heal.trigger || heal.recipient === 'self' || heal.recipient === 'party', '施放时的自动治疗须有确定的受益人。')).min(1).max(32).optional(),
  inputs: z.array(talentInputSchema).max(20).optional(), summon: linkedSummonSchema.optional(),
  noIndependentDamage: z.literal(true).optional(),
}).strict();
export const passiveSchema = z.object({ id: idSchema, name: idSchema, description: z.string().max(40000), unlockAscension:z.number().int().min(0).max(6).nullable(), moonsignLevel:z.literal(1).optional() }).strict();
export const constellationSchema = z.object({ rank:z.number().int().min(1).max(6), name:idSchema, description:z.string().max(40000),
  extraSkillCharge:z.literal(1).optional(),
  talentBonuses:z.array(z.object({category:z.enum(['normal','skill','burst']),levels:z.literal(3)}).strict()).max(3) }).strict();
export type Talent = CharacterMetadata['talents'][number];

export function talentInputMaximum(input: NonNullable<Talent['inputs']>[number], constellation: number): number {
  return (input.constellationLimits ?? []).reduce((current, limit) => limit.rank <= constellation && limit.rank > current.rank ? limit : current, {rank:0,max:input.max}).max;
}

/** Missing values stay unknown; supplied values must belong to this talent's source-declared range. */
export function talentInputIssues(talent: Pick<Talent, 'inputs'>, values: Record<string, number | null> = {}, constellation = 0): string[] {
  return Object.entries(values).flatMap(([id, value]) => {
    const input = talent.inputs?.find(input => input.id === id);
    if (!input) return [`技能未声明此命中输入：${id}`];
    return value !== null && (!Number.isFinite(value) || value < input.min || value > talentInputMaximum(input,constellation) || (input.integer && !Number.isInteger(value)))
      ? [`命中输入超出技能声明范围或整数要求：${id}`] : [];
  });
}

export function talentLevelBonus(character: { constellations: { rank: number; talentBonuses: { category: Talent['category']; levels: number }[] }[] }, category: Talent['category'], constellation: number): number {
  return character.constellations.filter(item => item.rank <= constellation).flatMap(item => item.talentBonuses)
    .filter(item => item.category === category).reduce((total, item) => total + item.levels, 0);
}
