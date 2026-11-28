import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { elements } from '../content/stats';
import { calculationValueSchema, calculationValueTypeSchema, definitionRefSchema, valueMatchesType } from './values';

/** Signatures are produced by fixed TS templates, never supplied by imported JSON. */
export const formulaInputSchema = z.object({
  type: calculationValueTypeSchema, required: z.boolean(), min: finiteSchema.optional(), max: finiteSchema.optional(), default: calculationValueSchema.optional(),
}).strict().superRefine((input, context) => {
  if (input.min !== undefined && input.max !== undefined && input.min > input.max) context.addIssue({ code: 'custom', message: '输入上界小于下界。' });
  if (input.type.kind !== 'quantity' && (input.min !== undefined || input.max !== undefined)) context.addIssue({ code: 'custom', message: '只有数量输入具有数值范围。' });
  if (input.default !== undefined && (input.required || !valueMatchesType(input.default, input.type))) context.addIssue({ code: 'custom', path: ['default'], message: '输入默认值与固定签名不匹配。' });
});
const revision = z.literal('1');
const stat = z.enum(['attack', 'hp', 'defense', 'elementalMastery']);
const relation = z.enum(['lt', 'lte', 'eq', 'gte', 'gt']);
const linearUnit = z.enum(['scalar', 'attack', 'hp', 'defense', 'elementalMastery', 'count']);
const template = <T extends string>(id: T) => ({ id: z.literal(id), revision });
const terms = z.array(z.object({ stat, attribute: idSchema, ratio: idSchema, count: idSchema.optional(), countUnit: z.literal('scalar').optional() }).strict()
  .refine(term => !term.countUnit || term.count !== undefined, '计数单位必须对应明确的计数输入。')).min(1).max(9);
const channels = z.array(z.object({ output: idSchema, rate: finiteSchema.nonnegative(), cap: finiteSchema.nonnegative() }).strict()).min(1).max(10);
export const calculationTemplateSchema = z.discriminatedUnion('id', [
  z.object({ ...template('scaled-damage'), terms, output: idSchema }).strict(),
  z.object({ ...template('damage-sum'), terms: z.number().int().min(2).max(9) }).strict(),
  z.object({ ...template('panel-base'), stat: z.enum(['hp', 'attack', 'defense']) }).strict(),
  z.object({ ...template('ordinary-hit'), baseFlat: z.enum(['attribute', 'effect-port']) }).strict(), z.object(template('ordinary-bonus')).strict(),
  z.object(template('defense')).strict(), z.object(template('resistance')).strict(), z.object(template('crit')).strict(),
  z.object(template('read-milliseconds')).strict(),
  z.object(template('discounted-stamina-cost')).strict(),
  z.object({ ...template('restore-skill-charges'), capacity: z.number().int().min(1).max(10) }).strict(),
  z.object({ ...template('crit-selected'), calculation: definitionRefSchema }).strict(),
  z.object({ ...template('reaction-em-bonus'), family: z.enum(['lunar', 'stellar']) }).strict(),
  z.object({ ...template('standard-reaction'), family: z.enum(['amplifying', 'additive', 'transformative']) }).strict(),
  z.object({ ...template('ordinary-reaction'), element: z.enum(elements), amplifying: definitionRefSchema.optional(), additive: definitionRefSchema.optional() }).strict(),
  z.object({ ...template('reaction-hit'), family: z.enum(['lunar-bloom', 'lunar-charged', 'lunar-crystallize', 'stellar-conduct', 'stellar-swirl']),
    origin: z.enum(['direct', 'individual']), mastery: definitionRefSchema, baseMultiplier: z.boolean().optional() }).strict(),
  z.object({ ...template('level-multiplier'), table: definitionRefSchema }).strict(),
  z.object({ ...template('count-coefficient'), table: definitionRefSchema, max: z.number().int().positive() }).strict(),
  z.object({ ...template('conditional-bonus'), input: idSchema, relation, threshold: finiteSchema, value: finiteSchema, otherwise: finiteSchema, output: idSchema }).strict(),
  z.object({ ...template('threshold-condition'), input: idSchema, relation, threshold: finiteSchema }).strict(),
  z.object({ ...template('quantity-condition'), input: idSchema, unit: linearUnit.or(z.enum(['energy', 'damage', 'milliseconds'])), relation,
    threshold: finiteSchema.optional(), thresholdInput: idSchema.optional(), maxInput: finiteSchema.nonnegative().optional() }).strict(),
  z.object({ ...template('enum-condition'), input: idSchema, values: z.array(idSchema).min(1).max(16), equals: idSchema }).strict(),
  z.object({ ...template('condition-group'), operator: z.enum(['all', 'any']), terms: z.number().int().min(1).max(16), negate: z.boolean() }).strict(),
  z.object({ ...template('linear-bonus'), input: idSchema, inputUnit: linearUnit.or(z.enum(['stamina', 'energy'])), outputUnit: z.enum(['scalar', 'attack', 'hp', 'defense', 'elementalMastery', 'damage', 'energy', 'stamina', 'milliseconds']),
    rate: finiteSchema, offset: finiteSchema, threshold: finiteSchema.nonnegative(), output: idSchema, maxInput: finiteSchema.nonnegative().optional(),
    confirmedStep: finiteSchema.positive().optional(),
    cap: finiteSchema.nonnegative().optional(), capInput: idSchema.optional(),
    capIncreases: z.array(z.object({ input: idSchema, amount: finiteSchema.positive() }).strict()).min(1).max(6).optional() }).strict(),
  z.object({ ...template('bounded-stat-bonus'), input: idSchema, stat: z.enum(['scalar', 'elementalMastery', 'hp']), threshold: finiteSchema, channels }).strict(),
  z.object({ ...template('attribute-conversion'), stat: z.enum(['hp', 'defense', 'energy', 'elementalMastery']), target: z.enum(['attack', 'damage', 'scalar']), attribute: idSchema, rate: idSchema, output: idSchema,
    conditionalRate: z.object({ input: idSchema, relation, threshold: finiteSchema, rate: idSchema }).strict().optional() }).strict(),
  z.object({ ...template('stat-product'), unit: z.enum(['scalar', 'attack', 'hp', 'defense', 'elementalMastery', 'damage', 'count', 'energy']) }).strict(),
  z.object({ ...template('healing-amount'), basis: z.literal('attack').optional() }).strict(),
  z.object({ ...template('shield-absorption'), basis: z.enum(['hp','attack','defense','elementalMastery']) }).strict(),
  z.object({ ...template('energy-full') }).strict(),
  z.object({ ...template('capped-conversion'), from: z.enum(['hp', 'attack', 'energy', 'count', 'defense', 'elementalMastery', 'scalar']), to: z.enum(['scalar', 'attack', 'elementalMastery']),
    per: finiteSchema.positive(), threshold: finiteSchema.nonnegative().optional() }).strict(),
  z.object({ ...template('constant-bonus'), value: calculationValueSchema, output: idSchema }).strict(),
]).superRefine((selected, context) => {
  if (selected.id === 'ordinary-reaction') {
    if (Boolean(selected.amplifying) !== ['pyro', 'hydro', 'cryo'].includes(selected.element)) context.addIssue({ code: 'custom', path: ['amplifying'], message: '增幅引用必须与元素适用范围一致。' });
    if (Boolean(selected.additive) !== ['electro', 'dendro'].includes(selected.element)) context.addIssue({ code: 'custom', path: ['additive'], message: '激化引用必须与元素适用范围一致。' });
  }
  if (selected.id === 'reaction-hit' && selected.origin === 'individual' && ['lunar-bloom', 'stellar-conduct'].includes(selected.family)) context.addIssue({ code: 'custom', path: ['origin'], message: '所选反应没有该逐人模板。' });
  if (selected.id === 'reaction-hit' && selected.origin !== 'direct' && selected.baseMultiplier) context.addIssue({ code: 'custom', path: ['baseMultiplier'], message: '技能基数倍率只适用于直接反应伤害。' });
  if (selected.id === 'bounded-stat-bonus' && new Set(selected.channels.map(channel => channel.output)).size !== selected.channels.length) context.addIssue({ code: 'custom', path: ['channels'], message: '输出通道重复。' });
  if (selected.id === 'enum-condition' && (new Set(selected.values).size !== selected.values.length || !selected.values.includes(selected.equals))) context.addIssue({ code: 'custom', path: ['values'], message: '枚举条件须使用唯一值及已声明的匹配项。' });
  if (selected.id === 'quantity-condition' && ((selected.threshold === undefined) === (selected.thresholdInput === undefined)
    || selected.input === selected.thresholdInput)) {
    context.addIssue({ code: 'custom', path: ['threshold'], message: '数量比较须声明一个独立的门槛来源。' });
  }
  if (selected.id === 'scaled-damage') {
    const names = selected.terms.flatMap(term => [term.attribute, term.ratio, ...term.count ? [term.count] : []]);
    if (new Set(names).size !== names.length) context.addIssue({ code: 'custom', path: ['terms'], message: '缩放输入身份重复。' });
  }
  if (selected.id === 'linear-bonus' && selected.capIncreases) {
    const names = [selected.input, ...selected.capIncreases.map(increase => increase.input)];
    if (selected.cap === undefined || new Set(names).size !== names.length) context.addIssue({ code: 'custom', path: ['capIncreases'], message: '上限增量须使用基础上限和独立条件。' });
  }
  if (selected.id === 'linear-bonus' && selected.capInput !== undefined
    && (selected.input === selected.capInput || selected.cap !== undefined || selected.confirmedStep !== undefined)) {
    context.addIssue({ code: 'custom', path: ['capInput'], message: '动态上限须为独立输入。' });
  }
  if (selected.id === 'linear-bonus' && selected.confirmedStep !== undefined && (selected.rate <= 0 || selected.capIncreases)) {
    context.addIssue({ code: 'custom', path: ['confirmedStep'], message: '已核实档位需要正比例和固定上限。' });
  }
});
/** Data-only template selection. Operations, signatures, stages and ports belong to TS. */
export const formulaDefinitionSchema = z.object({
  schemaVersion: z.literal(APP_VERSION), identity: definitionRefSchema, template: calculationTemplateSchema,
  sources: z.array(idSchema).min(1).max(1000).refine(ids => new Set(ids).size === ids.length, '来源标识重复。'),
}).strict();
export const calculationTemplateIds = Object.freeze(calculationTemplateSchema.options.map(option => option.shape.id.value));
export type FormulaDefinition = z.infer<typeof formulaDefinitionSchema>;
export type CalculationTemplate = z.infer<typeof calculationTemplateSchema>;
export type FormulaInput = z.infer<typeof formulaInputSchema>;
