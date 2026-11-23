import { z } from 'zod';
import { idSchema, millisecondsSchema } from '../common/values';
import { definitionKey, definitionRefSchema } from '../calculation/values';
import { attributeDefinitionSchema, calculationHitSelectorSchema } from '../calculation/effect';
import { calculationEventSelectorSchema } from '../calculation/event';
import { calculationSourceSchema } from '../calculation/source';
import { buffExpressionSchema, characterMetadataSchema } from '../content/character-metadata';
import { commonCombatFacts } from '../calculation/buffs.mjs';
import { elements } from '../content/stats';

const sceneAttributeScopes = {
  'attribute.reaction.electro-charged.rangeBonus': 'hit',
  'attribute.actorEndureDelta': 'actor',
} as const;
const sceneAttributeIds = Object.keys(sceneAttributeScopes) as (keyof typeof sceneAttributeScopes)[];

export function sceneAttributeReferences(buffs: readonly { modifiers: readonly { target: string }[] }[]) {
  const targets = new Set(buffs.flatMap(buff => buff.modifiers.map(modifier => modifier.target)));
  return sceneAttributeIds.filter(id => targets.has(id)).map(id => ({ namespace: 'builtin', id, revision: '1' }));
}

const target = z.enum(['attribute.flatAttack', 'attribute.flatDefense', 'attribute.hpPercent', 'attribute.critRate', 'attribute.critDamage',
  'attribute.physicalBonus', 'attribute.pyroBonus', 'attribute.hydroBonus', 'attribute.cryoBonus', 'attribute.electroBonus', 'attribute.anemoBonus',
  'attribute.geoBonus', 'attribute.dendroBonus', 'attribute.healingBonus', 'attribute.energyRecharge', 'attribute.shieldStrength','attribute.elementalMastery',
  'attribute.attackPercent','attribute.defensePercent','attribute.damageBonus',
  'attribute.reaction.lunar.damageBonus', 'attribute.reaction.stellar-swirl.damageBonus', 'attribute.reaction.transformative.damageBonus',
  ...sceneAttributeIds,
  'target.resistance.physical', 'target.resistance.pyro', 'target.resistance.hydro', 'target.resistance.electro', 'target.resistance.cryo',
  'target.resistance.geo', 'target.resistance.anemo', 'target.resistance.dendro']);
const modifier = z.object({ target, value: buffExpressionSchema }).strict();
const sceneHitFields = {
  systemValue: z.literal('ElementLevelCo'),
  multiplier: z.number().finite().positive(),
  trigger: idSchema,
  radius: z.number().finite().positive().optional(),
  cooldownMs: millisecondsSchema.positive().optional(),
  delayMs: millisecondsSchema.positive().optional(),
  element: z.enum(elements).optional(),
  sourceRefs: z.array(z.string().min(1).max(500)).min(1).max(8),
};
const sceneHitDefinitionSchema = z.union([
  z.object({ ...sceneHitFields, recipient: z.literal('enemy'), trueDamage: z.literal(true) }).strict(),
  z.object({ ...sceneHitFields, recipient: z.enum(['enemy', 'character']), settlement: z.literal('unverified') }).strict(),
]);

export const sceneHitRequestSchema = z.object({
  scene: definitionRefSchema.extend({ namespace: z.literal('builtin'), id: idSchema.startsWith('scene.field.') }).strict(),
  elementLevelCo: z.number().finite().nonnegative().nullable(),
  triggered: z.boolean().nullable(),
  targetHit: z.boolean().nullable(),
}).strict();

export const sceneDefinitionSchema = definitionRefSchema.extend({
  name: idSchema, group: z.enum(['attack-food', 'defense-food', 'potion', 'field']), durationMs: millisecondsSchema.nullable(),
  facts: characterMetadataSchema.shape.facts, formulas: characterMetadataSchema.shape.formulas,
  buffs: z.array(z.object({ id: idSchema, recipient: z.enum(['team','owner','target']), condition:buffExpressionSchema.optional(),
    trigger: z.object({ kind: z.literal('event'), selector: calculationEventSelectorSchema, cooldownMs:millisecondsSchema.positive().optional() }).strict().optional(),
    lifetime: z.object({ kind:z.literal('interval'),durationMs:millisecondsSchema.positive(),phase:z.literal('after') }).strict().optional(),
    stacking: z.object({maxStacks:z.number().int().min(1).max(100)}).strict().optional(),
    appliesTo: calculationHitSelectorSchema.optional(), modifiers: z.array(modifier).min(1).max(8) }).strict()).max(8),
  hits: z.array(sceneHitDefinitionSchema).length(1).optional(),
  dependencies: z.object({
    attributes: z.array(attributeDefinitionSchema).min(1).max(sceneAttributeIds.length),
    sources: z.array(calculationSourceSchema).min(1).max(8),
  }).strict().optional(),
}).strict().superRefine((scene, ctx) => {
  if (scene.namespace !== 'builtin' || !scene.id.startsWith('scene.') || scene.durationMs === 0) ctx.addIssue({ code: 'custom', message: '场景定义无效。' });
  if ((!scene.buffs.length && !scene.hits) || (scene.hits && (scene.group !== 'field' || !scene.id.startsWith('scene.field.')))) {
    ctx.addIssue({ code: 'custom', message: '场景须包含增益或已确认的场地冲击。' });
  }
  if (scene.dependencies) {
    const { attributes, sources } = scene.dependencies;
    const required = new Set(sceneAttributeReferences(scene.buffs).map(definitionKey));
    for (const [index, attribute] of attributes.entries()) {
      const id = attribute.identity.id as keyof typeof sceneAttributeScopes;
      if (!required.delete(definitionKey(attribute.identity)) || attribute.scope !== sceneAttributeScopes[id]
        || attribute.type.kind !== 'quantity' || attribute.type.unit !== 'scalar' || attribute.base.kind !== 'constant') {
        ctx.addIssue({ code: 'custom', path: ['dependencies', 'attributes', index], message: '场景属性快照的目标、修订或定义无效。' });
      }
    }
    if (required.size) ctx.addIssue({ code: 'custom', path: ['dependencies', 'attributes'], message: '场景缺少所需的属性快照。' });
    const sourceIds = new Set(attributes.flatMap(attribute => attribute.sources));
    if (!sources.every(source => sourceIds.delete(source.id)) || sourceIds.size) {
      ctx.addIssue({ code: 'custom', path: ['dependencies', 'sources'], message: '场景来源快照缺失、重复或未被引用。' });
    }
  }
  for (const key of Object.keys(scene.facts ?? {})) if (key === scene.id || Object.hasOwn(commonCombatFacts, key)) {
    ctx.addIssue({ code: 'custom', path: ['facts', key], message: '场景事实与已有定义重名。' });
  }
  function checkFacts(value: z.infer<typeof buffExpressionSchema>) {
    if (typeof value === 'number') return;
    if ('call' in value) Object.values(value.inputs).forEach(checkFacts);
    if ('fact' in value && !Object.hasOwn(commonCombatFacts, value.fact) && !Object.hasOwn(scene.facts ?? {}, value.fact)) {
      ctx.addIssue({ code: 'custom', message: '场景使用了未声明的战斗事实。' });
    }
  }
  const ids = new Set<string>();
  for (const buff of scene.buffs) {
    if (!!buff.trigger !== !!buff.lifetime || buff.trigger && buff.recipient === 'owner' && buff.trigger.selector.actor !== 'owner') ctx.addIssue({code:'custom',message:'限时场地增益须对应触发时长及受益者。'});
    if (!buff.id.startsWith(scene.id + '.') || ids.has(buff.id)) ctx.addIssue({ code: 'custom', message: '场景增益标识冲突。' });
    ids.add(buff.id);
    if (buff.condition !== undefined) checkFacts(buff.condition);
    for (const modifier of buff.modifiers) {
      checkFacts(modifier.value);
      if (modifier.target.startsWith('target.') !== (buff.recipient === 'target')) ctx.addIssue({ code: 'custom', message: '场景增益受益者与目标属性不符。' });
      const unit = modifier.target === 'attribute.flatAttack' ? 'attack' : modifier.target === 'attribute.flatDefense' ? 'defense' : modifier.target==='attribute.elementalMastery'?'elementalMastery':'scalar';
      const literalUnit = typeof modifier.value === 'number' ? 'scalar' : 'amount' in modifier.value ? modifier.value.unit : undefined;
      if (literalUnit !== undefined && literalUnit !== unit) ctx.addIssue({ code: 'custom', message: '场景增益数值单位不符。' });
    }
  }
});
export const sceneSelectionsSchema = z.array(z.object({ definition: sceneDefinitionSchema, startMs: millisecondsSchema, endMs: millisecondsSchema }).strict()).max(16)
  .superRefine((entries, ctx) => {
    for (const [i, entry] of entries.entries()) {
      if (entry.endMs <= entry.startMs || entry.definition.durationMs !== null && entry.endMs - entry.startMs > entry.definition.durationMs) {
        ctx.addIssue({ code: 'custom', path: [i, 'endMs'], message: '场景效果时间超出有效范围。' });
      }
      if (entries.slice(0, i).some(other => other.definition.group === entry.definition.group && other.endMs > entry.startMs && entry.endMs > other.startMs
        && !(entry.definition.group === 'field' && entry.definition.id !== other.definition.id && sceneDomain(entry.definition.id) === sceneDomain(other.definition.id)))) {
        ctx.addIssue({ code: 'custom', path: [i], message: '同类场景效果的有效区间重叠。' });
      }
    }
  });
export type SceneDefinition = z.infer<typeof sceneDefinitionSchema>;
export type SceneSelection = z.infer<typeof sceneSelectionsSchema>[number];
export type SceneHitRequest = z.infer<typeof sceneHitRequestSchema>;

export function sceneDomain(id: string) { return id.replace(/\.\d+$/, ''); }

export function matchingSceneHits(selections: readonly SceneSelection[] | undefined, scene: SceneHitRequest['scene']) {
  return (selections ?? []).filter(entry => entry.definition.hits?.length && definitionKey(entry.definition) === definitionKey(scene));
}

export function sceneHitInInterval(selection: SceneSelection, timeMs: number) {
  const hit = selection.definition.hits?.[0];
  return !!hit && timeMs - (hit.delayMs ?? 0) >= selection.startMs && timeMs < selection.endMs;
}
