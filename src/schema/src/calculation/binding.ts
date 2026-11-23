import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { elements } from '../content/stats';
import { calculationQuantityTypeSchema, calculationValueSchema, calculationValueTypeSchema, definitionRefSchema, type DefinitionRef, type Value, type ValueType } from './values';

export const actorSelectorSchema = z.discriminatedUnion('role', [
  z.object({ role: z.enum(['owner', 'recipient', 'contributor']) }).strict(),
  z.object({ role: z.literal('fact-actor'), input: idSchema }).strict(),
]);
export const calculationReadTimeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('current'), phase: z.enum(['same', 'before', 'after']) }).strict(),
  z.object({ kind: z.literal('capture'), slot: idSchema }).strict(),
  z.object({ kind: z.literal('source-event'), phase: z.enum(['before', 'after']) }).strict(),
]);
export type CalculationActorSelector = z.infer<typeof actorSelectorSchema>;
export type CalculationReadTime = z.infer<typeof calculationReadTimeSchema>;
export const teamCountSchema = z.object({
  elements: z.array(z.enum(elements)).min(1).max(8).refine(values => new Set(values).size === values.length, '元素条件重复。'),
  match: z.enum(['include','exclude']), excludeOwner: z.boolean(), cap: z.number().int().min(1).max(4).optional(), distinctElements: z.literal(true).optional(),
}).strict();
export type CalculationBinding =
  | { kind: 'attribute'; actor: CalculationActorSelector; key: DefinitionRef; at: CalculationReadTime;
    excludeCurrentEffect?: true; excludeExtraAttack?: true; excludeOwnerBuffs?: DefinitionRef[] }
  | { kind: 'talent-parameter'; actor: CalculationActorSelector; skillId: string; parameterId: string; type: ValueType }
  | { kind: 'actor-state'; actor: CalculationActorSelector; property: 'ascension' | 'constellation' | 'refinement' }
  | { kind: 'team-attribute'; key: DefinitionRef; aggregate: 'max' | 'sum' }
  | ({ kind: 'team-count' } & z.infer<typeof teamCountSchema>)
  | { kind: 'team-region'; region:string; excludeOwner?: true; match?: 'exclude' }
  | { kind: 'refinement-parameter'; values: number[]; type: Extract<ValueType, { kind: 'quantity' }> }
  | { kind: 'fact'; key: string; type: ValueType; at?: 'source-event' | 'last-observation'; scope: 'query' | 'owner' | 'recipient' | 'event-actor' | 'contributor' | 'target' | 'team' | 'source-event' }
  | { kind: 'enemy'; key: DefinitionRef; at: Exclude<CalculationReadTime, { kind: 'capture' }> }
  | { kind: 'formula'; formula: DefinitionRef; inputs: Record<string, CalculationBinding>; output: string }
  | { kind: 'constant'; value: Value };

export const calculationBindingSchema: z.ZodType<CalculationBinding> = z.lazy(() => z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('attribute'), actor: actorSelectorSchema, key: definitionRefSchema, at: calculationReadTimeSchema,
    excludeCurrentEffect: z.literal(true).optional(), excludeExtraAttack: z.literal(true).optional(),
    excludeOwnerBuffs: z.array(definitionRefSchema).min(1).max(32).optional() }).strict()
    .refine(read => !read.excludeExtraAttack || read.key.id === 'attribute.attack', '非额外攻击力须读取攻击力属性。'),
  z.object({ kind: z.literal('talent-parameter'), actor: actorSelectorSchema, skillId: idSchema, parameterId: idSchema, type: calculationValueTypeSchema }).strict(),
  z.object({ kind: z.literal('actor-state'), actor: actorSelectorSchema, property: z.enum(['ascension', 'constellation', 'refinement']) }).strict(),
  z.object({ kind: z.literal('team-attribute'), key: definitionRefSchema, aggregate: z.enum(['max', 'sum']) }).strict(),
  z.object({ kind: z.literal('team-region'), region:idSchema, excludeOwner:z.literal(true).optional(), match:z.literal('exclude').optional() }).strict(),
  teamCountSchema.extend({kind:z.literal('team-count')}),
  z.object({ kind: z.literal('refinement-parameter'), values: z.array(finiteSchema).length(5), type: calculationQuantityTypeSchema }).strict(),
  z.object({ kind: z.literal('fact'), key: idSchema, type: calculationValueTypeSchema, at: z.enum(['source-event','last-observation']).optional(),
    scope: z.enum(['query', 'owner', 'recipient', 'event-actor', 'contributor', 'target', 'team', 'source-event']) }).strict(),
  z.object({ kind: z.literal('enemy'), key: definitionRefSchema, at: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('current'), phase: z.enum(['same', 'before', 'after']) }).strict(),
    z.object({ kind: z.literal('source-event'), phase: z.enum(['before', 'after']) }).strict(),
  ]) }).strict(),
  z.object({ kind: z.literal('formula'), formula: definitionRefSchema, inputs: z.record(idSchema, calculationBindingSchema), output: idSchema }).strict(),
  z.object({ kind: z.literal('constant'), value: calculationValueSchema }).strict(),
]));

export const calculationFactSchema = z.object({ value: calculationValueSchema.nullable(), provenance: z.enum(['explicit', 'recorded', 'derived']), sourceRefs: z.array(idSchema).max(1000) }).strict();
export type CalculationFact = z.infer<typeof calculationFactSchema>;
export const calculationCaptureSlotSchema = z.object({
  id: idSchema, sourceSkillId: idSchema, attributes: z.array(definitionRefSchema).min(1).max(1000),
  allowedPhases: z.array(z.enum(['before', 'after'])).min(1).max(2).refine(phases => new Set(phases).size === phases.length, '捕获阶段不得重复。'),
}).strict();
export const boundFormulaSchema = z.object({ formula: definitionRefSchema, bindings: z.record(idSchema, calculationBindingSchema),
  output: idSchema, captures: z.array(calculationCaptureSlotSchema).max(1000), predicate: calculationBindingSchema.optional() }).strict();
export type BoundFormula = z.infer<typeof boundFormulaSchema>;
export type CalculationCaptureSlot = z.infer<typeof calculationCaptureSlotSchema>;
