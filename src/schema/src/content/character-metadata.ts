import { commonCombatFacts, combatFactDeclaration } from '../calculation/buffs.mjs';
import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { characterFieldsSchema } from './entity-fields';
import { structuredHitSchema } from './calculation';
import { constellationSchema, damageScalingStatSchema, passiveSchema, talentFieldsSchema } from './talent';
import { effectDefinitionSchema, teamHealthCounterSchema } from '../calculation/effect';
import { formulaDefinitionSchema } from '../calculation/template';
import { calculationValueTypeSchema, definitionRefSchema } from '../calculation/values';
import { calculationCoverageRecordSchema, coverageImpactSchema } from '../calculation/coverage';
import { combatExpressionSchema as expression } from './combat-expression';
import { metadataAcquisitionPath } from './metadata-fields.mjs';
import { directLunarFamilies } from './reactions';

const ids = z.array(idSchema).max(1000);
const scaling = z.object({ stat: damageScalingStatSchema, parameter: idSchema.optional(), skill: idSchema.optional(), ratio: finiteSchema.optional(),
  count: idSchema.optional(), countUnit: z.enum(['count','scalar']).optional(), formula: idSchema.optional() }).strict()
  .refine(term => (term.parameter !== undefined) !== (term.ratio !== undefined) && (!term.countUnit || !!term.count), '缩放项须指定一个倍率来源及有效计数。');
export const namedHitBaseSchema = z.object({ template: idSchema, inputs: z.record(idSchema, expression), output: idSchema.optional() }).strict();
const damageFamily = z.enum(['ordinary', 'stellar-swirl', 'stellar-conduct', ...directLunarFamilies]);
const hit = z.object({
  id: idSchema, name: idSchema, element: structuredHitSchema.shape.element.optional(), category: structuredHitSchema.shape.category.optional(),
  elementBy: structuredHitSchema.shape.elementBy, coordinated: structuredHitSchema.shape.coordinated, infusion: structuredHitSchema.shape.infusion, critical: structuredHitSchema.shape.critical, reactions: structuredHitSchema.shape.reactions,
  selection: structuredHitSchema.shape.selection,
  snapshot: structuredHitSchema.shape.snapshot.unwrap().omit({ source: true }).optional(),
  base: z.union([z.array(scaling).min(1).max(128), namedHitBaseSchema]),
  family: z.union([damageFamily, z.literal('unresolved'), z.object({ by: idSchema, cases: z.record(idSchema, damageFamily) }).strict()]).optional(),
  origin: z.enum(['talent', 'triggered']).optional(), when: z.array(z.union([idSchema, expression])).min(1).max(32).optional(),
  support: idSchema, coverageId: idSchema.optional(),
}).strict();
const grantedHits = z.array(hit.extend({ skill: idSchema }).strict()).max(1000).optional();
const support = z.object(calculationCoverageRecordSchema.shape).pick({ resolution: true, evidence: true, reason: true }).extend({
  maxConstellation: z.number().int().min(0).max(6), mechanisms: z.array(z.object({ id: idSchema, resolution: z.enum(['implemented','irrelevant','unavailable']),
    reason: z.string().min(1).optional(), rules: ids.optional(), impact: coverageImpactSchema.optional() }).strict()).min(1),
});
const modifier = z.object({ target: idSchema, value: expression, extraAttack: z.literal(true).optional(), condition: expression.optional(), ownerElements:effectDefinitionSchema.shape.activation.shape.elements, appliesTo: effectDefinitionSchema.shape.appliesTo.optional(),
  recipientElements: effectDefinitionSchema.shape.activation.shape.elements, recipientWeaponTypes: effectDefinitionSchema.shape.activation.shape.weaponTypes,
  recipient: z.enum(['owner', 'team', 'target']).optional(), constellation: z.number().int().min(1).max(6).optional() }).strict()
  .refine(entry => !entry.extraAttack || entry.target === 'attribute.attack', '额外攻击力贡献须指向攻击力。');
const damageChange = z.object({
  critical: z.boolean(), categories: effectDefinitionSchema.shape.appliesTo.shape.categories,
  chance: z.array(finiteSchema.min(0).max(1)).length(5), cooldownMs: z.array(z.number().int().nonnegative()).length(5),
  change: z.discriminatedUnion('kind', [z.object({ kind: z.literal('clear-particles'), count: z.number().int().positive().max(20) }).strict(),
    z.object({ kind: z.literal('reset-skill') }).strict()]),
}).strict();
const energyRecovery = z.object({amount:finiteSchema.positive(),intervalMs:z.number().int().positive(),offField:z.literal(true)}).strict();
export const periodicEnergySchema = z.union([
  energyRecovery.extend({belowRatio:finiteSchema.positive().max(1)}),
  energyRecovery.extend({belowEnergy:finiteSchema.positive()}),
]);
const buff = z.object(effectDefinitionSchema.shape).pick({ trigger: true, lifetime: true, appliesTo: true, application: true, priority: true, activation: true, windowFact: true }).partial().extend({
  trigger: z.union([effectDefinitionSchema.shape.trigger, z.literal('cast'), z.object({ cast: idSchema }).strict()]).optional(), duration: z.object({ parameter: idSchema }).strict().optional(),
  counter: teamHealthCounterSchema.extend({ cap: z.object({ parameter: idSchema }).strict() }).optional(),
  charges: z.object({ parameter: idSchema, categories: effectDefinitionSchema.shape.charges.unwrap().shape.categories }).strict().optional(),
  id: idSchema, excludeOwner: z.boolean().optional(), recipient: z.enum(['owner','team','target']).optional(),
  modifiers: z.array(modifier).max(32), condition: expression.optional(), onDamage: damageChange.optional(),
  periodicEnergy: periodicEnergySchema.optional(),
  stacking: effectDefinitionSchema.shape.stacking.partial().optional(),
}).strict().refine(buff => buff.onDamage || buff.periodicEnergy ? !(buff.onDamage && buff.periodicEnergy) && !buff.modifiers.length && !buff.trigger && !buff.condition && !buff.activation
  && !buff.appliesTo && !buff.recipient && !buff.lifetime && !buff.charges && !buff.counter && !buff.stacking && !buff.application && !buff.duration
  : buff.modifiers.length > 0, '即时变化与属性授予各自声明适用条件。')
  .refine(buff => buff.modifiers.every(modifier => !(modifier.recipientElements || modifier.recipientWeaponTypes)
    || (modifier.recipient ?? buff.recipient) === 'team'), '受益队员筛选须用于队伍增益。');
export { expression as buffExpressionSchema };
export const buffsSchema = z.array(buff).max(1000).optional();
const buffs = buffsSchema;
export function validateMetadataFields(value:unknown, validation:z.RefinementCtx) {
  const path=metadataAcquisitionPath(value);
  if (path) validation.addIssue({code:'custom',path,message:'正式元数据不得包含采集摘要、上游路径、来源地址或提交号。'});
}
export const characterMetadataSchema = characterFieldsSchema.pick({ kind: true, id: true, revision: true, identity: true, attributes: true, derivedFrom: true }).extend({
  schemaVersion: z.literal(APP_VERSION), namespace: definitionRefSchema.shape.namespace,
  progression: z.object({ curveIds: z.object({ hp: idSchema, attack: idSchema, defense: idSchema }).strict(), promotion: characterFieldsSchema.shape.progression.shape.promotion }).strict(),
  talents: z.array(talentFieldsSchema.extend({ hits: z.array(hit).max(1000), buffs })).max(30),
  passives: z.array(passiveSchema.extend({ buffs, hits: grantedHits })).max(30),
  constellations: z.array(constellationSchema.extend({ buffs, hits: grantedHits })).max(6),
  support: z.record(idSchema, support), contextSupport: idSchema, contextCoverageId: idSchema.optional(), curves: z.record(idSchema, z.array(finiteSchema.nonnegative()).min(91).max(101)).optional(),
  facts: z.record(idSchema, z.object({ scope: z.enum(['owner','recipient','query','team','target','contributor','source-event']),
    type: calculationValueTypeSchema, label: idSchema.optional() }).strict()).optional(),
  formulas: z.array(z.object({ id: idSchema, template: formulaDefinitionSchema.shape.template }).strict()).optional(), buffs,
}).strict().superRefine((character, validation) => {
  validateMetadataFields(character,validation);
  const unique = (ids: string[], field: string) => {
    if (new Set(ids).size !== ids.length) validation.addIssue({ code: 'custom', path: [field], message: '身份重复。' });
  };
  unique(character.talents.map(skill => skill.id), 'talents');
  for (const [index, talent] of character.talents.entries()) {
    for (const field of ['parameters', 'inputs'] as const) {
      const entries = talent[field] ?? [];
      if (new Set(entries.map(entry => entry.id)).size !== entries.length) validation.addIssue({code:'custom',path:['talents',index,field],message:'同一天赋内的标识须唯一。'});
    }
    if (talent.noIndependentDamage && talent.hits.length) validation.addIssue({code:'custom',path:['talents',index,'hits'],message:'已声明无独立伤害的技能不能同时登记伤害命中。'});
  }
  for (const [index, talent] of character.talents.entries()) if (talent.cooldownParameter) {
    const parameter = talent.parameters.find(p => p.id === talent.cooldownParameter);
    if (talent.category === 'normal' || parameter?.unit !== 'seconds' || !parameter.values.every(v => v > 0)) {
      validation.addIssue({ code: 'custom', path: ['talents', index, 'cooldownParameter'], message: '施放冷却须引用正数秒数。' });
    }
  }
  for (const [i,talent] of character.talents.entries()) if (talent.skillCharges && (talent.category !== 'skill' || !talent.cooldownParameter)) {
    validation.addIssue({ code:'custom', path:['talents',i,'skillCharges'], message:'多充能战技须声明战技冷却。' });
  }
  for (const [index, talent] of character.talents.entries()) if (talent.energyCapacity !== undefined) {
    const cost = talent.energyCapacity, param = cost === 0 ? undefined : talent.parameters.find(p => p.id === cost.parameter);
    if (talent.category !== 'burst' || cost !== 0 && (param?.unit !== 'energy' || !param.values.every(v => v >= 0 && v === param.values[0]))) {
      validation.addIssue({ code: 'custom', path: ['talents', index, 'energyCapacity'], message: '爆发能量上限须引用固定的能量参数。' });
    }
  }
  for (const [i,talent] of character.talents.entries()) if (talent.castWindow) {
    const rule=talent.castWindow, duration=talent.parameters.find(p=>p.id===rule.durationParameter);
    const hits=[...talent.hits,...[...character.passives,...character.constellations].flatMap(p=>p.hits??[]).filter(h=>h.skill===talent.id)];
    const field=character.facts?.[rule.fact];
    const counter=rule.hitCounter, input=counter && talent.inputs?.find(i=>i.id===counter.input);
    const follow=rule.followUp;
    if (follow && (character.facts?.[follow.ready]?.scope!=='query' || character.facts[follow.ready].type.kind!=='boolean'
      || !hits.some(h=>h.id===follow.hit && h.when?.includes(follow.ready))
      || follow.triggers.some(id=>id===follow.hit || !talent.hits.some(h=>h.id===id)))) {
      validation.addIssue({code:'custom',path:['talents',i,'castWindow','followUp'],message:'追加攻击须引用本技能的触发段、追加段及其事件条件。'});
    }
    if (counter && (!input || input.type?.kind!=='quantity' || input.type.unit!=='count' || !input.integer || input.min!==0 || counter.ascension.initial>input.max
      || [...counter.hits,counter.ascension.fillHit].some(id=>!hits.some(h=>h.id===id)))) validation.addIssue({code:'custom',path:['talents',i,'castWindow','hitCounter'],message:'姿态计数须引用本技能的计数输入、命中和合法初始层数。'});
    if (field?.scope!=='owner' || field.type.kind!=='boolean' || duration?.unit!=='seconds' || !duration.values.every(v=>v>0)
      || [rule.contact,rule.exit].some(g=>g && (!hits.some(h=>h.id===g.hit) || character.facts?.[g.ready]?.scope!=='query' || character.facts[g.ready].type.kind!=='boolean'))) {
      validation.addIssue({code:'custom',path:['talents',i,'castWindow'],message:'技能窗口的时长、条件或关联命中无效。'});
    }
  }
  for (const key of Object.keys(character.facts ?? {})) if (Object.hasOwn(commonCombatFacts, key)) {
    validation.addIssue({ code: 'custom', path: ['facts', key], message: '公共事实只需引用，无须重复声明。' });
  }
  const granted = [...character.passives, ...character.constellations].flatMap(owner => owner.hits ?? []);
  const heals = character.talents.flatMap(talent => talent.heals ?? []);
  unique(heals.map(heal => heal.id), 'heals');
  for (const [i, talent] of character.talents.entries()) for (const [j, heal] of (talent.heals ?? []).entries()) {
    const rate = talent.parameters.find(parameter => parameter.id === heal.rate);
    const flat = talent.parameters.find(parameter => parameter.id === heal.flat);
    const counter = heal.count && combatFactDeclaration(character.facts, heal.count.fact);
    if (heal.count && (counter?.scope !== 'query' || counter.type.kind !== 'quantity' || counter.type.unit !== 'count')) {
      validation.addIssue({ code: 'custom', path: ['talents', i, 'heals', j, 'count'], message: '治疗次数须引用本次事件的计数事实。' });
    }
    const grantExists = (grant: typeof heal.origin) => grant && ('passive' in grant ? character.passives[grant.passive] : character.constellations[grant.constellation]);
    const origin = grantExists(heal.origin);
    const multiplierOrigin = typeof heal.multiplier === 'object' ? heal.multiplier.origin : undefined;
    if (heal.origin && (!origin || !heal.label) || (heal.detail === undefined ? !origin : !talent.details[heal.detail])
      || heal.extra?.origin && !grantExists(heal.extra.origin) || multiplierOrigin && !grantExists(multiplierOrigin)
      || typeof heal.rate === 'string' && rate?.unit !== 'ratio' || typeof heal.flat === 'string' && flat?.unit !== 'hp'
      || typeof heal.extra?.rate === 'string' && !talent.parameters.some(parameter => parameter.id === heal.extra!.rate && parameter.unit === 'ratio')) {
      validation.addIssue({ code: 'custom', path: ['talents', i, 'heals', j], message: '治疗须关联有效的详情或命名授予来源，并使用有效倍率和固定生命值。' });
    }
  }
  const allHits = [...character.talents.flatMap(talent => talent.hits), ...granted];
  unique(allHits.map(hit => hit.id), 'hits');
  for (const hit of granted) if (!character.talents.some(t => t.id === hit.skill)) {
    validation.addIssue({ code: 'custom', path: ['hits', hit.id, 'skill'], message: '命中须关联同一角色的技能。' });
  }
  const grants = [character, ...character.talents, ...character.passives, ...character.constellations].flatMap(owner => owner.buffs ?? []);
  unique(grants.map(buff => buff.id), 'buffs');
  for (const buff of grants) {
    if (buff.counter) {
      const keys = [buff.counter.fact, ...(buff.counter.overflowFact ? [buff.counter.overflowFact] : [])];
      if (new Set(keys).size !== keys.length || keys.some(key => {
        const field = combatFactDeclaration(character.facts, key);
        return field?.scope !== 'owner' || field.type.kind !== 'quantity' || field.type.unit !== 'scalar';
      })) validation.addIssue({ code: 'custom', path: ['buffs', buff.id, 'counter'], message: '计数与溢出量须对应持有者不同的无量纲事实。' });
    }
    if (buff.modifiers.some(modifier => modifier.recipient) && buff.recipient !== 'team') {
      validation.addIssue({ code: 'custom', path: ['buffs', buff.id, 'modifiers'], message: '仅全队增益可以单独指定贡献只给持有者。' });
    }
  }
  for (const [index, talent] of character.talents.entries()) if (talent.summon) {
    const rule = talent.summon, duration = talent.parameters.find(parameter => parameter.id === rule.durationParameter);
    const release = character.talents.find(other => other.id === rule.release.skill);
    if (!duration || duration.unit !== 'seconds' || duration.values.some(v => v <= 0) || rule.rankHits.length < rule.capacity + 1
      || rule.rankHits.some(id => !talent.hits.some(hit => hit.id === id))
      || ![rule.release.hit, rule.release.additionalHit].every(id => release?.hits.some(hit => hit.id === id))) {
      validation.addIssue({ code: 'custom', path: ['talents', index, 'summon'], message: '召唤物持续时间、位阶或引爆命中无效。' });
    }
  }
  for (const hit of allHits) {
    const rank = hit.selection?.minConstellation;
    if (rank && ('skill' in hit || !character.constellations.some(entry => entry.rank === rank))) {
      validation.addIssue({ code: 'custom', path: ['hits', hit.id, 'selection', 'minConstellation'], message: '技能内命中的解锁条件须引用自身已有的命座。' });
    }
    if (hit.infusion && (hit.elementBy || hit.coordinated || hit.family && hit.family !== 'ordinary' || character.facts?.[hit.infusion.fact]?.scope !== 'owner'
      || character.facts[hit.infusion.fact].type.kind !== 'boolean')) validation.addIssue({ code:'custom',path:['hits',hit.id,'infusion'],message:'属性转化须引用自身布尔状态和普通直伤。' });
    if (hit.coordinated) {
      const rule = hit.coordinated, gate = combatFactDeclaration(character.facts, rule.readyFact);
      const talent = character.talents.find(t => t.hits.some(h => h.id === hit.id) || 'skill' in hit && hit.skill === t.id);
      const duration = talent?.parameters.find(p => p.id === rule.window?.duration), charges = talent?.parameters.find(p => p.id === rule.window?.charges);
      if (hit.elementBy || hit.family && hit.family !== 'ordinary' || gate?.scope !== 'query' || gate.type.kind !== 'boolean'
        || rule.window && (duration?.unit !== 'seconds' || !duration.values.every(v => v > 0) || charges?.unit !== 'count' || !charges.values.every(v => Number.isSafeInteger(v) && v > 0))) {
        validation.addIssue({ code: 'custom', path: ['hits', hit.id, 'coordinated'], message: '协同攻击须有独立的就绪事实及有效的技能时长和次数。' });
      }
    }
    if (hit.elementBy && hit.family && hit.family !== 'ordinary') validation.addIssue({ code: 'custom', path: ['hits', hit.id, 'elementBy'], message: '元素转化段须使用普通伤害乘区。' });
    if (typeof hit.family === 'object') {
      const type = combatFactDeclaration(character.facts, hit.family.by)?.type;
      if (type?.kind !== 'enum' || Object.keys(hit.family.cases).length !== type.values.length || type.values.some(key => !Object.hasOwn((hit.family as { cases: object }).cases, key))) {
        validation.addIssue({ code: 'custom', path: ['hits', hit.id, 'family'], message: '命中分支须覆盖事实的全部枚举值。' });
      }
    }
  }
});
export type CharacterMetadata = z.infer<typeof characterMetadataSchema>;
