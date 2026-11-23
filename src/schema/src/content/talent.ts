import { z } from 'zod';
import { combatExpressionSchema } from './combat-expression';
import { idSchema, finiteSchema } from '../common/values';
import { elements } from './stats';
import { calculationQuantityTypeSchema } from '../calculation/values';
import type { CharacterMetadata } from './character-metadata';
import type { StructuredBuild } from '../account/structured-build';
import { partyInfusionElements } from '../calculation/party-infusion.mjs';
export const damageScalingStatSchema = z.enum(['attack', 'hp', 'defense', 'elementalMastery']);
export type DamageScalingStat = z.infer<typeof damageScalingStatSchema>;
export const parameterSchema = z.object({ id: idSchema, unit: z.enum(['ratio','scalar','seconds','energy','stamina','staminaPerSecond','pointsPerSecond','hp','attack','defense','elementalMastery','count','unknown']), values: z.array(finiteSchema).min(1).max(30) }).strict();
export const talentInputSchema = z.object({
  id: idSchema, type: calculationQuantityTypeSchema, min: finiteSchema.nonnegative(), max: finiteSchema.nonnegative(), integer: z.boolean(),
  usage: z.literal('healing').optional(),
  constellationLimits: z.array(z.object({ rank: z.number().int().min(1).max(6), max: finiteSchema.nonnegative() }).strict()).max(6).optional(),
}).strict().refine(input => input.max >= input.min && (!input.integer || (Number.isInteger(input.min) && Number.isInteger(input.max)))
  && (input.constellationLimits ?? []).every(limit => limit.max >= input.min && (!input.integer || Number.isInteger(limit.max)))
  && new Set(input.constellationLimits?.map(limit => limit.rank)).size === (input.constellationLimits ?? []).length, '技能输入范围无效。');
const frames = z.number().int().nonnegative().max(36000);
const healingOrigin = z.union([z.object({ passive: z.number().int().nonnegative() }).strict(),
  z.object({ constellation: z.number().int().nonnegative() }).strict()]);
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
  heals: z.array(z.object({ id: idSchema, detail: z.number().int().nonnegative().optional(), stat: damageScalingStatSchema.optional(),
    origin: healingOrigin.optional(),
    rate: z.union([idSchema, finiteSchema.nonnegative()]), flat: z.union([idSchema, finiteSchema.nonnegative()]).optional(),
    basisActor: z.literal('recipient').optional(), basisAmount: combatExpressionSchema.optional(), recipientHpCap: finiteSchema.nonnegative().optional(),
    recipient: z.enum(['self', 'other', 'party', 'on-field']),
    bonusInteraction: z.enum(['unverified', 'incoming-unverified']).optional(),
    basisFactor: combatExpressionSchema.optional(), extra: z.object({ stat: damageScalingStatSchema,
      rate: z.union([idSchema, finiteSchema.nonnegative()]), cap: finiteSchema.nonnegative().optional(), origin: healingOrigin.optional() }).strict().optional(),
    label: idSchema.optional(), multiplier: z.union([finiteSchema.positive(), z.object({
      value: finiteSchema.positive(), condition: combatExpressionSchema, origin: healingOrigin.optional(),
      bonusInteraction: z.literal('unverified').optional(),
    }).strict()]).optional(),
    condition: combatExpressionSchema.optional(), count: z.object({ fact: idSchema, cap: z.number().int().positive().optional() }).strict().optional(),
    trigger: z.literal('cast').optional() }).strict()
    .refine(heal => (heal.stat !== undefined) !== (heal.basisAmount !== undefined) && (!heal.basisActor || heal.stat !== undefined), '治疗基数须选取配装属性或本次生命值表达式。')
    .refine(heal => !heal.trigger || heal.recipient === 'self' || heal.recipient === 'party', '施放时的自动治疗须有确定的受益人。')).min(1).max(32).optional(),
  inputs: z.array(talentInputSchema).max(20).optional(), summon: linkedSummonSchema.optional(),
  noIndependentDamage: z.literal(true).optional(),
  partyInfusion: z.enum(partyInfusionElements).optional(),
}).strict();
const talentCategory = z.enum(['normal', 'skill', 'burst']);
const talentBonus = z.object({ category: talentCategory, levels: z.literal(3) }).strict();
export const passiveSchema = z.object({ id: idSchema, name: idSchema, description: z.string().max(40000), unlockAscension:z.number().int().min(0).max(6).nullable(), moonsignLevel:z.literal(1).optional(),
  talentBonuses: z.array(talentBonus.extend({ levels: z.literal(1), recipient: z.literal('team'), exactPartyElements: z.array(z.enum(elements)).min(1).max(7)
    .refine(list => new Set(list).size === list.length, '队伍元素条件不得重复。').optional() })).min(1).max(3)
    .refine(rules => new Set(rules.map(rule => rule.category)).size === rules.length, '同一被动不得重复授予同类天赋等级。').optional(),
}).strict();
export const constellationSchema = z.object({ rank:z.number().int().min(1).max(6), name:idSchema, description:z.string().max(40000),
  extraSkillCharge:z.literal(1).optional(),
  partyInfusion: z.enum(partyInfusionElements).optional(),
  talentBonuses:z.array(talentBonus).max(3) }).strict();
export type Talent = CharacterMetadata['talents'][number];

export function healingGrant(build: Pick<StructuredBuild, 'character' | 'ascension' | 'constellation'>, origin: NonNullable<Talent['heals']>[number]['origin']) {
  if (!origin) return { unlocked: true };
  if ('passive' in origin) {
    const passive = build.character.metadata.passives[origin.passive];
    return { name: passive?.name, unlocked: !!passive && build.ascension >= (passive.unlockAscension ?? 0) };
  }
  const entry = build.character.metadata.constellations[origin.constellation];
  return { name: entry?.name, unlocked: !!entry && build.constellation >= entry.rank };
}

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

export interface TalentRank { level: number; upperLevel?: number }
type TalentOwner = Pick<StructuredBuild, 'character' | 'ascension' | 'constellation' | 'talents'>;
type PartyMember = { build?: TalentOwner; element?: typeof elements[number] };

/** Resolve each party grant once, using only the members and revisions in this loadout. */
export function createTalentRankReader(members: readonly PartyMember[]) {
  const party = members.map(member => member.build?.character.identity.element ?? member.element);
  const unknown = party.filter(element => element === undefined).length;
  const bonuses = { normal: { min: 0, max: 0 }, skill: { min: 0, max: 0 }, burst: { min: 0, max: 0 } };
  const sources = { normal: new Set<string>(), skill: new Set<string>(), burst: new Set<string>() };
  const granted = new Set<string>();
  for (const { build } of members) {
    if (!build) continue;
    const { character } = build;
    for (const passive of character.passives) for (const rule of passive.talentBonuses ?? []) {
      if (build.ascension < (passive.unlockAscension ?? 0)) continue;
      const key = JSON.stringify([character.namespace, character.id, character.revision, passive.id, rule.category]);
      if (granted.has(key)) continue;
      granted.add(key);
      const allowed = rule.exactPartyElements;
      if (allowed && (party.some(element => element !== undefined && !allowed.includes(element))
        || allowed.filter(element => !party.includes(element)).length > unknown)) continue;
      const bonus = bonuses[rule.category];
      bonus.max += rule.levels;
      for (const source of character.sources) sources[rule.category].add(source);
      if (!allowed || unknown === 0) bonus.min += rule.levels;
    }
  }
  return (build: TalentOwner, category: Talent['category']): TalentRank & { sourceRefs: string[] } => {
    const base = build.talents[category] + talentLevelBonus(build.character, category, build.constellation);
    const { min, max } = bonuses[category];
    return { level: base + min, ...(min !== max ? { upperLevel: base + max } : {}), sourceRefs: [...sources[category]] };
  };
}

/** An unresolved party slot only masks values that actually differ between possible ranks. */
export function talentCurveValue<T>(values: readonly T[] | undefined, rank: TalentRank, equal: (a: T, b: T) => boolean = Object.is): T | undefined {
  const first = values?.[rank.level - 1];
  if (first === undefined) return undefined;
  for (let level = rank.level + 1; level <= (rank.upperLevel ?? rank.level); level++) {
    const other = values?.[level - 1];
    if (other === undefined || !equal(first, other)) return undefined;
  }
  return first;
}

export function talentParameterAt(talent: Pick<Talent, 'parameters'>, id: string | undefined, rank: TalentRank) {
  return talentCurveValue(talent.parameters.find(parameter => parameter.id === id)?.values, rank);
}
