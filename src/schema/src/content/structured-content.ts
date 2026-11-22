import { artifactSetMetadataSchema, weaponMetadataSchema } from './equipment-metadata';
import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { idSchema } from '../common/values';
import { characterFieldsSchema, weaponFieldsSchema, artifactSetFieldsSchema } from './entity-fields';
import { talentFieldsSchema, passiveSchema, constellationSchema } from './talent';
import { elements, statSchema } from './stats';
import { boundFormulaSchema, type CalculationBinding } from '../calculation/binding';
import { calculationBundleSchema, type CalculationBundle } from '../calculation/bundle';
import { definitionKey, definitionRefSchema } from '../calculation/values';
import { characterMetadataSchema } from './character-metadata';
import { structuredHitSchema, equipmentHitSchema } from './calculation';
export { structuredHitSchema } from './calculation';

const refs = z.array(definitionRefSchema).max(1000);
const sources = z.array(idSchema).min(1).max(1000);
const profile = z.object({ bundle: calculationBundleSchema, ruleIds: refs }).strict();
const resonanceParticles = z.object({ id: idSchema, element: z.enum(elements), count: z.number().int().positive(),
  cooldownMs: z.number().int().nonnegative(), reactions: z.array(idSchema).min(1), swirlElements: z.array(z.enum(elements)) }).strict();
export const structuredTalentSchema = talentFieldsSchema.extend({
  hits: z.array(structuredHitSchema).max(1000), sources, ruleIds: refs,
}).strict();
const structuredPassiveSchema = passiveSchema.extend({ ruleIds: refs }).strict();
const structuredConstellationSchema = constellationSchema.extend({ ruleIds: refs }).strict();

function validateProfile(bundle: CalculationBundle, ruleIds: z.infer<typeof refs>, validation: z.RefinementCtx): void {
  const effects = new Set(bundle.effects.map(effect => definitionKey(effect.identity)));
  if (ruleIds.some(reference => !effects.has(definitionKey(reference)))) validation.addIssue({ code: 'custom', path: ['calculation', 'ruleIds'], message: '内容快照缺少规则的精确版本。' });
}
export const structuredCharacterDefinitionSchema = characterFieldsSchema.extend({
  metadata: characterMetadataSchema, schemaVersion: z.literal(APP_VERSION), namespace: definitionRefSchema.shape.namespace, attributes: characterFieldsSchema.shape.attributes.extend({ outputs: z.record(statSchema, definitionRefSchema) }),
  talents: z.array(structuredTalentSchema).max(30), passives: z.array(structuredPassiveSchema).max(30),
  constellations: z.array(structuredConstellationSchema).max(6), sources, calculation: profile.extend({ contextCoverageRefs: refs.min(1), gleam:z.object({name:idSchema,ruleIds:refs}).strict().optional(), resonances: z.array(z.object({ element: z.union([z.enum(elements), z.literal('distinct')]), name: idSchema, ruleIds: refs, particles: resonanceParticles.optional() }).strict()).max(8).optional() }).strict(),
}).strict().superRefine((character, validation) => {
  const bundle = character.calculation.bundle;
  const allRules = [...character.calculation.ruleIds, ...character.talents.flatMap(talent => talent.ruleIds), ...character.passives.flatMap(passive => passive.ruleIds), ...character.constellations.flatMap(constellation => constellation.ruleIds)];
  validateProfile(bundle, allRules, validation);
  const entity = { namespace: character.namespace, id: character.id, revision: character.revision };
  if ((character.origin === 'builtin') !== (character.namespace === 'builtin')) validation.addIssue({ code: 'custom', path: ['namespace'], message: '内容来源与命名空间不匹配。' });
  const coverage = new Map(bundle.coverage.map(record => [definitionKey(record.identity), record]));
  for (const reference of character.calculation.contextCoverageRefs) {
    const record = coverage.get(definitionKey(reference));
    if (!record || definitionKey(record.entity) !== definitionKey(entity) || record.scope.kind !== 'context') validation.addIssue({ code: 'custom', path: ['calculation', 'contextCoverageRefs'], message: '角色上下文覆盖记录归属不匹配。' });
  }
  if (new Set(allRules.map(definitionKey)).size !== allRules.length) validation.addIssue({ code: 'custom', path: ['calculation', 'ruleIds'], message: '角色规则重复归属。' });
  for (const passive of character.passives) for (const reference of passive.ruleIds) {
    const effect = bundle.effects.find(effect => definitionKey(effect.identity) === definitionKey(reference));
    if (effect && (effect.activation.ascension ?? 0) < (passive.unlockAscension ?? 0)) validation.addIssue({ code: 'custom', path: ['passives'], message: '被动规则与解锁阶段不匹配。' });
  }
  for (const constellation of character.constellations) for (const reference of constellation.ruleIds) {
    const effect = bundle.effects.find(effect => definitionKey(effect.identity) === definitionKey(reference));
    if (effect && (effect.activation.constellation === undefined || effect.activation.constellation < constellation.rank)) validation.addIssue({ code: 'custom', path: ['constellations'], message: '命座规则与解锁等级不匹配。' });
  }
  const talentIds = new Set(character.talents.map(talent => talent.id));
  if (talentIds.size !== character.talents.length || new Set(character.constellations.map(item => item.rank)).size !== character.constellations.length) validation.addIssue({ code: 'custom', path: ['talents'], message: '技能或命座身份重复。' });
  for (const [index, talent] of character.talents.entries()) {
    const inputs = new Map(talent.inputs?.map(input => [input.id, input]));
    if (inputs.size !== (talent.inputs?.length ?? 0)) validation.addIssue({ code: 'custom', path: ['talents', index, 'inputs'], message: '技能输入身份重复。' });
    if (talent.noIndependentDamage && talent.hits.length) validation.addIssue({ code: 'custom', path: ['talents', index], message: '无独立伤害技能不得声明伤害命中。' });
    if (new Set(talent.parameters.map(parameter => parameter.id)).size !== talent.parameters.length || new Set(talent.hits.map(hit => hit.id)).size !== talent.hits.length) validation.addIssue({ code: 'custom', path: ['talents', index], message: '技能参数或命中身份重复。' });
    function visit(binding: CalculationBinding): void {
      if (binding.kind === 'talent-parameter' && binding.actor.role === 'owner') {
        const owner = character.talents.find(candidate => candidate.id === binding.skillId);
        if (!owner?.parameters.some(parameter => parameter.id === binding.parameterId)) validation.addIssue({ code: 'custom', path: ['talents', index], message: '命中绑定引用了不存在的角色技能参数。' });
      }
      if (binding.kind === 'formula') Object.values(binding.inputs).forEach(visit);
    }
    for (const hit of talent.hits) {
      const capture = hit.snapshot;
      if (capture && (!talentIds.has(capture.sourceSkillId) || new Set(capture.attributes).size !== capture.attributes.length
        || !hit.base.captures.some(slot => slot.sourceSkillId === capture.sourceSkillId && capture.attributes.every(stat => slot.attributes.some(reference => reference.id === `attribute.${stat}`))))) {
        validation.addIssue({ code: 'custom', path: ['talents', index, 'hits'], message: '命中捕获来源或展示属性与绑定不一致。' });
      }
      function validateBaseInput(binding: CalculationBinding): void {
        if (binding.kind === 'fact' && binding.scope === 'query' && (binding.type.kind !== 'quantity' || inputs.get(binding.key)?.type.unit !== binding.type.unit)) {
          validation.addIssue({ code: 'custom', path: ['talents', index, 'hits'], message: '伤害基数引用了未声明或单位不一致的技能输入。' });
        }
        if (binding.kind === 'formula') Object.values(binding.inputs).forEach(validateBaseInput);
      }
      Object.values(hit.base.bindings).forEach(validateBaseInput);
      const references = hit.coverageRefs;
      for (const reference of references) {
        const record = coverage.get(definitionKey(reference));
        if (!record || definitionKey(record.entity) !== definitionKey(entity) || record.scope.kind !== 'hit' || record.scope.skillId !== talent.id || record.scope.hitId !== hit.id) validation.addIssue({ code: 'custom', path: ['talents', index, 'hits'], message: '命中覆盖记录的实体或查询范围不匹配。' });
      }
      for (const invocation of [hit.base, ...Object.values(hit.damage)]) {
        Object.values(invocation.bindings).forEach(visit);
        if (invocation.predicate) visit(invocation.predicate);
        if (invocation.captures.some(slot => !talentIds.has(slot.sourceSkillId))) validation.addIssue({ code: 'custom', path: ['talents', index], message: '捕获槽引用了不存在的来源技能。' });
      }
    }
  }
});

export const structuredWeaponDefinitionSchema = weaponFieldsSchema.extend({
  metadata: weaponMetadataSchema, schemaVersion: z.literal(APP_VERSION), kind: z.literal('weapon-definition'), hits: z.array(equipmentHitSchema).optional(), namespace: definitionRefSchema.shape.namespace, revision: idSchema, sources, calculation: profile, coverageRefs: refs.min(1),
}).strict().superRefine((weapon, validation) => {
  validateProfile(weapon.calculation.bundle, weapon.calculation.ruleIds, validation);
  for (const reference of weapon.coverageRefs) {
    const record = weapon.calculation.bundle.coverage.find(record => definitionKey(record.identity) === definitionKey(reference));
    if (!record || definitionKey(record.entity) !== definitionKey(weapon) || record.scope.kind !== 'equipment' || record.scope.pieces !== undefined) validation.addIssue({ code: 'custom', path: ['coverageRefs'], message: '武器覆盖记录归属不匹配。' });
  }
});
export const structuredArtifactSetDefinitionSchema = artifactSetFieldsSchema.extend({
  metadata: artifactSetMetadataSchema, schemaVersion: z.literal(APP_VERSION), kind: z.literal('artifact-set-definition'), namespace: definitionRefSchema.shape.namespace, revision: idSchema, sources, rarity: z.number().int().min(1).max(5),
  effects: z.array(z.object({ pieces: z.number().int().min(1).max(5), hits: z.array(equipmentHitSchema).optional(), ruleIds: refs, coverageRefs: refs.min(1) }).strict()).max(5), calculation: profile,
}).strict().superRefine((set, validation) => {
  validateProfile(set.calculation.bundle, [...set.calculation.ruleIds, ...set.effects.flatMap(effect => effect.ruleIds)], validation);
  if (new Set(set.effects.map(effect => effect.pieces)).size !== set.effects.length) validation.addIssue({ code: 'custom', path: ['effects'], message: '套装件数重复。' });
  for (const effect of set.effects) for (const reference of effect.coverageRefs) {
    const record = set.calculation.bundle.coverage.find(record => definitionKey(record.identity) === definitionKey(reference));
    if (!record || definitionKey(record.entity) !== definitionKey(set) || record.scope.kind !== 'equipment' || record.scope.pieces !== effect.pieces) validation.addIssue({ code: 'custom', path: ['effects'], message: '套装覆盖记录归属或件数不匹配。' });
  }
});
export type StructuredCharacterDefinition = z.infer<typeof structuredCharacterDefinitionSchema>;
export type StructuredWeaponDefinition = z.infer<typeof structuredWeaponDefinitionSchema>;
export type StructuredArtifactSetDefinition = z.infer<typeof structuredArtifactSetDefinitionSchema>;
