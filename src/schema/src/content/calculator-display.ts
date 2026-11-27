import { z } from 'zod';
import { idSchema } from '../common/values';

export const calculatorDamageGroups = ['skill', 'burst', 'normal', 'charged', 'plunge', 'other', 'weapon', 'set', 'reaction', 'scene'] as const;
export type CalculatorDamageGroup = typeof calculatorDamageGroups[number];

const card = z.object({ code: idSchema.optional(), alias: idSchema.optional(), note: z.string().trim().min(1).optional() }).strict();
export const calculatorDisplaySchema = z.object({
  hits: z.record(idSchema, card).optional(),
  buffs: z.record(idSchema, card.extend({ scope: z.literal('exploration').optional() })).optional(),
}).strict();
// These outputs describe travel, terrain or exploration resources. Combat movement,
// healing and stamina modifiers can still belong to the same talent.
const explorationTargets = new Set([
  'attribute.foodPhlogistonRestored', 'attribute.sprintStartStaminaCostAdded', 'attribute.sprintSustainStaminaCostAdded',
  'attribute.fallDamageReduction', 'attribute.glideSpeed', 'attribute.staminaCostReduction.climb', 'attribute.staminaCostReduction.glide',
  'attribute.staminaCostReduction.swim', 'attribute.xenochromaticFontemerAbilityCooldownReduction',
  'attribute.saurianBaseHealing', 'attribute.nightsoulTransmissionCooldownReduction',
]);
export function isCalculatorCombatModifier(target: string, card?: { scope?: 'exploration' }) {
  return card?.scope !== 'exploration' && !explorationTargets.has(target);
}
const damageTargets = new Set([
  'attribute.hp', 'attribute.flatHp', 'attribute.hpPercent', 'attribute.whiteHp',
  'attribute.attack', 'attribute.flatAttack', 'attribute.attackPercent', 'attribute.whiteAttack',
  'attribute.defense', 'attribute.flatDefense', 'attribute.defensePercent', 'attribute.whiteDefense',
  'attribute.critRate', 'attribute.critDamage', 'attribute.elementalMastery',
  'attribute.energyRecharge', 'attribute.healingBonus',
  'attribute.damageBonus', 'attribute.physicalBonus', 'attribute.anemoBonus', 'attribute.geoBonus',
  'attribute.electroBonus', 'attribute.hydroBonus', 'attribute.pyroBonus', 'attribute.cryoBonus', 'attribute.dendroBonus',
  'attribute.baseDamageBonus', 'base-flat', 'attribute.baseMultiplier', 'attribute.elevationFactor', 'attribute.defenseIgnore',
  'attribute.amplifyingReactionBonus', 'attribute.additiveReactionBonus',
  'target.defenseReduction', 'target.ordinaryDamageReduction',
]);
export function isCalculatorDamageModifier(target: string, card?: { scope?: 'exploration' }): boolean {
  if (card?.scope === 'exploration') return false;
  if (damageTargets.has(target) || target.startsWith('target.resistance.')) return true;
  return target.startsWith('attribute.reaction.') && target !== 'attribute.reaction.electro-charged.rangeBonus';
}
export const characterCalculatorDisplaySchema = calculatorDisplaySchema.extend({
  groups: z.array(z.object({ type: z.enum(calculatorDamageGroups), expanded: z.boolean() }).strict()).optional(),
  pinnedHits: z.array(idSchema).optional(),
});

export function validateCalculatorDisplay(display: z.infer<typeof characterCalculatorDisplaySchema> | undefined,
  owners: readonly { hits?: readonly { id: string }[]; buffs?: readonly { id: string }[] }[], ctx: z.RefinementCtx) {
  if (!display) return;
  for (const field of ['hits', 'buffs'] as const) {
    const known = new Set(owners.flatMap(owner => (owner[field] ?? []).map(entry => entry.id)));
    for (const id of Object.keys(display[field] ?? {})) {
      if (!known.has(id)) ctx.addIssue({ code: 'custom', path: ['calculator', field, id], message: '卡片须引用本定义已有的条目。' });
    }
    if (field === 'hits') for (const [index, id] of (display.pinnedHits ?? []).entries()) {
      if (!known.has(id) || display.pinnedHits!.indexOf(id) !== index) ctx.addIssue({
        code: 'custom', path: ['calculator', 'pinnedHits', index], message: '置顶伤害须引用本定义内不同的命中。',
      });
    }
  }
  const groups = display.groups?.map(group => group.type) ?? [];
  if (new Set(groups).size !== groups.length) ctx.addIssue({ code: 'custom', path: ['calculator', 'groups'], message: '伤害类型不能重复。' });
}
