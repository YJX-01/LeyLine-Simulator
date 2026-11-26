import { equipmentHitSchema } from './calculation';
import { z } from 'zod';
import { APP_VERSION } from '../version.mjs';
import { idSchema } from '../common/values';
import { definitionRefSchema } from '../calculation/values';
import { calculationEventSelectorSchema } from '../calculation/event';
import { calculationCoverageRecordSchema } from '../calculation/coverage';
import { artifactSetFieldsSchema, weaponFieldsSchema } from './entity-fields';
import { calculatorDisplaySchema, validateCalculatorDisplay } from './calculator-display';
import { buffsSchema, buffExpressionSchema, characterMetadataSchema, namedHitBaseSchema, validateMetadataFields } from './character-metadata';

const coverage = z.object(calculationCoverageRecordSchema.shape).pick({ resolution: true, evidence: true, reason: true, mechanisms: true });
const hits = z.array(z.object({ id: idSchema, name: idSchema, element: equipmentHitSchema.shape.element,
  category: equipmentHitSchema.shape.category, critical: equipmentHitSchema.shape.critical, reactions: equipmentHitSchema.shape.reactions, accumulate: equipmentHitSchema.shape.accumulate, confirmedProc: equipmentHitSchema.shape.confirmedProc,
  base: namedHitBaseSchema, family: z.enum(['ordinary', 'resistance-only']), when: z.array(z.union([idSchema, buffExpressionSchema])).optional() }).strict()).optional();
const fields = {
  schemaVersion: z.literal(APP_VERSION), namespace: definitionRefSchema.shape.namespace, revision: idSchema,
  calculator: calculatorDisplaySchema.optional(),
  facts: characterMetadataSchema.shape.facts, formulas: characterMetadataSchema.shape.formulas, buffs: buffsSchema,
  categoryStacks: z.array(z.object({ fact: idSchema, durationMs: z.number().int().positive().max(3600000),
    categories: z.array(z.enum(['normal','charged','plunge','skill','burst'])).min(1).max(5),
    maxStacks: z.number().int().min(1).max(5), pieces: z.number().int().min(2).max(5).optional() }).strict()).max(10).optional(),

};
export const weaponMetadataSchema = weaponFieldsSchema.extend({
  sharedEventStacks: z.array(z.object({ countFact: idSchema, fullFact: idSchema.optional(), initialStacks: z.literal(0).optional(), selector: calculationEventSelectorSchema,
    sourceOwnerFact: idSchema.optional(), durationMs: z.number().int().positive().max(3600000), cooldownMs: z.number().int().nonnegative().max(3600000),
    maxStacks: z.number().int().min(1).max(10), refresh: z.literal('unverified').optional(), fullTriggerFact: idSchema.optional() }).strict()).max(10).optional(),
  ...fields, kind: z.literal('weapon-definition'), hits, support: coverage }).strict()
  .superRefine(validateMetadataFields).superRefine((weapon, ctx) => {
    for (const [index, rule] of (weapon.sharedEventStacks ?? []).entries()) {
      const count = weapon.facts?.[rule.countFact], full = rule.fullFact ? weapon.facts?.[rule.fullFact] : undefined;
      if (count?.scope !== 'owner' || count.type.kind !== 'quantity' || count.type.unit !== 'count'
        || rule.fullFact && (full?.scope !== 'owner' || full.type.kind !== 'boolean') || rule.selector.actor !== 'owner') {
        ctx.addIssue({ code: 'custom', path: ['sharedEventStacks', index], message: '共刷新叠层须引用持有者计数和满层布尔事实。' });
      }
    }
    for (const [index, rule] of (weapon.categoryStacks ?? []).entries()) {
      const fact = weapon.facts?.[rule.fact];
      if (rule.pieces !== undefined || fact?.scope !== 'owner' || fact.type.kind !== 'quantity' || fact.type.unit !== 'count'
        || new Set(rule.categories).size !== rule.categories.length || rule.maxStacks > rule.categories.length
        || weapon.categoryStacks?.findIndex(entry => entry.fact === rule.fact) !== index)
        ctx.addIssue({ code: 'custom', path: ['categoryStacks', index], message: '类别叠层须引用持有者计数事实，类别不得重复。' });
    }
    validateCalculatorDisplay(weapon.calculator, [weapon], ctx);
    const groups = new Map<string, string>();
    for (const [index, hit] of (weapon.hits ?? []).entries()) {
      const rule = hit.confirmedProc;
      if (!rule) continue;
      const fact = weapon.facts?.[rule.confirmedFact];
      const bound = hit.when?.some(entry => typeof entry === 'string' ? entry === rule.confirmedFact : !!entry && typeof entry === 'object' && 'fact' in entry && entry.fact === rule.confirmedFact);
      if (!fact || fact.scope !== 'query' || fact.type.kind !== 'boolean' || !bound) ctx.addIssue({ code: 'custom', path: ['hits', index, 'confirmedProc', 'confirmedFact'], message: '已确认触发须引用本命中条件中的查询布尔事实。' });
      if (new Set(rule.sourceCategories).size !== rule.sourceCategories.length) ctx.addIssue({ code: 'custom', path: ['hits', index, 'confirmedProc', 'sourceCategories'], message: '触发来源类型不得重复。' });
      const signature = JSON.stringify([rule.confirmedFact, rule.cooldownMs, [...rule.sourceCategories].sort()]);
      if (groups.has(rule.group) && groups.get(rule.group) !== signature) ctx.addIssue({ code: 'custom', path: ['hits', index, 'confirmedProc'], message: '共用冷却的触发条件、间隔与来源类型须一致。' });
      groups.set(rule.group, signature);
    }
  });
export const artifactSetMetadataSchema = artifactSetFieldsSchema.extend({ ...fields, kind: z.literal('artifact-set-definition'),
  rarity: z.number().int().min(1).max(5), effects: z.array(z.object({ pieces: z.number().int().min(1).max(5), buffs: buffsSchema, hits, support: coverage }).strict()).max(5),
}).strict().superRefine(validateMetadataFields).superRefine((set, ctx) => {
  for (const [index, rule] of (set.categoryStacks ?? []).entries()) {
    const fact = set.facts?.[rule.fact];
    if (!rule.pieces || !set.effects.some(effect => effect.pieces === rule.pieces) || fact?.scope !== 'owner' || fact.type.kind !== 'quantity' || fact.type.unit !== 'count'
      || new Set(rule.categories).size !== rule.categories.length || rule.maxStacks > rule.categories.length
      || set.categoryStacks?.findIndex(entry => entry.fact === rule.fact) !== index)
      ctx.addIssue({ code: 'custom', path: ['categoryStacks', index], message: '类别叠层须引用持有者计数事实和存在的套装件数，类别不得重复。' });
  }
  validateCalculatorDisplay(set.calculator, [set, ...set.effects], ctx);
  for (const [i, effect] of set.effects.entries()) for (const [j, hit] of (effect.hits ?? []).entries()) if (hit.confirmedProc)
    ctx.addIssue({ code: 'custom', path: ['effects', i, 'hits', j, 'confirmedProc'], message: '已确认触发冷却目前仅支持武器。' });
});
