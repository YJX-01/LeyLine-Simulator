import { z } from 'zod';
import { idSchema, millisecondsSchema } from '../common/values';
import { definitionRefSchema } from '../calculation/values';
import { calculationHitSelectorSchema } from '../calculation/effect';
import { calculationEventSelectorSchema } from '../calculation/event';
import { buffExpressionSchema } from '../content/character-metadata';
import { commonCombatFacts } from '../calculation/buffs.mjs';

const target = z.enum(['attribute.flatAttack', 'attribute.flatDefense', 'attribute.hpPercent', 'attribute.critRate', 'attribute.critDamage',
  'attribute.physicalBonus', 'attribute.pyroBonus', 'attribute.hydroBonus', 'attribute.cryoBonus', 'attribute.electroBonus', 'attribute.anemoBonus',
  'attribute.geoBonus', 'attribute.dendroBonus', 'attribute.healingBonus', 'attribute.energyRecharge', 'attribute.shieldStrength','attribute.elementalMastery',
  'attribute.attackPercent','attribute.defensePercent','attribute.damageBonus',
  'attribute.reaction.lunar.damageBonus', 'attribute.reaction.stellar-swirl.damageBonus', 'attribute.reaction.transformative.damageBonus']);
const modifier = z.object({ target, value: z.union([z.number().finite(), z.object({ amount: z.number().finite(), unit: z.enum(['attack', 'defense','elementalMastery']) }).strict()]) }).strict();
const sceneCondition = buffExpressionSchema.superRefine((expression, context) => {
  function check(value: typeof expression) {
    if (typeof value === 'number') return;
    if ('call' in value) Object.values(value.inputs).forEach(check);
    if ('fact' in value && !Object.hasOwn(commonCombatFacts, value.fact)) context.addIssue({ code:'custom', message:'场景条件使用了未声明的战斗事实。' });
  }
  check(expression);
});
export const sceneDefinitionSchema = definitionRefSchema.extend({
  name: idSchema, group: z.enum(['attack-food', 'defense-food', 'potion', 'field']), durationMs: millisecondsSchema.nullable(),
  buffs: z.array(z.object({ id: idSchema, recipient: z.enum(['team','owner']), condition:sceneCondition.optional(),
    trigger: z.object({ kind: z.literal('event'), selector: calculationEventSelectorSchema, cooldownMs:millisecondsSchema.positive().optional() }).strict().optional(),
    lifetime: z.object({ kind:z.literal('interval'),durationMs:millisecondsSchema.positive(),phase:z.literal('after') }).strict().optional(),
    stacking: z.object({maxStacks:z.number().int().min(1).max(100)}).strict().optional(),
    appliesTo: calculationHitSelectorSchema.optional(), modifiers: z.array(modifier).min(1).max(8) }).strict()).min(1).max(8),
}).strict().superRefine((scene, ctx) => {
  if (scene.namespace !== 'builtin' || !scene.id.startsWith('scene.') || scene.durationMs === 0) ctx.addIssue({ code: 'custom', message: '场景定义无效。' });
  const ids = new Set<string>();
  for (const buff of scene.buffs) {
    if (!!buff.trigger !== !!buff.lifetime || buff.trigger && buff.recipient === 'owner' && buff.trigger.selector.actor !== 'owner') ctx.addIssue({code:'custom',message:'限时场地增益须对应触发时长及受益者。'});
    if (!buff.id.startsWith(scene.id + '.') || ids.has(buff.id)) ctx.addIssue({ code: 'custom', message: '场景增益标识冲突。' });
    ids.add(buff.id);
    for (const modifier of buff.modifiers) {
      const unit = modifier.target === 'attribute.flatAttack' ? 'attack' : modifier.target === 'attribute.flatDefense' ? 'defense' : modifier.target==='attribute.elementalMastery'?'elementalMastery':'scalar';
      if ((typeof modifier.value === 'number' ? 'scalar' : modifier.value.unit) !== unit) ctx.addIssue({ code: 'custom', message: '场景增益数值单位不符。' });
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

export function sceneDomain(id: string) { return id.replace(/\.\d+$/, ''); }
