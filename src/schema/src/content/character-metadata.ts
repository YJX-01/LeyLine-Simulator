import { APP_VERSION } from '../version.mjs';
import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { characterFieldsSchema } from './entity-fields';
import { structuredHitSchema } from './calculation';
import { constellationSchema, damageScalingStatSchema, passiveSchema, talentSchema, talentInputSchema } from './talent';
import { effectDefinitionSchema } from '../calculation/effect';
import { formulaDefinitionSchema } from '../calculation/template';
import { calculationQuantityTypeSchema, calculationValueTypeSchema, definitionRefSchema } from '../calculation/values';
import { calculationCoverageRecordSchema } from '../calculation/coverage';
import { elements } from './stats';

const ids = z.array(idSchema).max(1000);
type Expression = number | { stat: string; actor?: 'owner' | 'recipient' | 'contributor' } | { state: 'ascension' | 'constellation' | 'refinement' }
  | { parameter: string; skill: string } | { fact: string }
  | { teamCount: { elements: typeof elements[number][]; match: 'include' | 'exclude'; excludeOwner: boolean } }
  | { call: string; inputs: Record<string, Expression>; output?: string };
const expression: z.ZodType<Expression> = z.lazy(() => z.union([finiteSchema,
  z.object({ stat: idSchema, actor: z.enum(['owner', 'recipient', 'contributor']).optional() }).strict(),
  z.object({ state: z.enum(['ascension', 'constellation', 'refinement']) }).strict(),
  z.object({ parameter: idSchema, skill: idSchema }).strict(), z.object({ fact: idSchema }).strict(),
  z.object({ teamCount: z.object({ elements: z.array(z.enum(elements)), match: z.enum(['include','exclude']), excludeOwner: z.boolean() }).strict() }).strict(),
  z.object({ call: idSchema, inputs: z.record(idSchema, expression), output: idSchema.optional() }).strict(),
]));
const scaling = z.object({ stat: damageScalingStatSchema, parameter: idSchema.optional(), ratio: finiteSchema.optional(),
  count: idSchema.optional(), countUnit: z.enum(['count','scalar']).optional(), formula: idSchema.optional() }).strict()
  .refine(term => (term.parameter !== undefined) !== (term.ratio !== undefined) && (!term.countUnit || !!term.count), '缩放项须指定一个倍率来源及有效计数。');
const hit = structuredHitSchema.pick({ id: true, element: true, category: true, parameter: true, snapshot: true }).extend({
  snapshot: structuredHitSchema.shape.snapshot.unwrap().omit({ source: true }).optional(),
  scaling: z.array(scaling).min(1).max(2), support: idSchema, coverageId: idSchema.optional(),
  outputs: z.array(z.object({ id: idSchema, family: z.enum(['ordinary','stellar-swirl']), origin: z.enum(['talent','triggered']).optional(), condition: expression.optional() }).strict()).max(1000),
});
const support = z.object(calculationCoverageRecordSchema.shape).pick({ resolution: true, evidence: true, reason: true }).extend({
  maxConstellation: z.number().int().min(0).max(6), mechanisms: z.array(z.object({ id: idSchema, resolution: z.enum(['implemented','irrelevant','unavailable']),
    reason: z.string().min(1).optional(), rules: ids.optional() }).strict()).min(1),
});
const effect = z.object(effectDefinitionSchema.shape).pick({ trigger: true, lifetime: true, appliesTo: true, application: true, priority: true, activation: true }).partial().extend({
  id: idSchema, target: idSchema, excludeOwner: z.boolean().optional(), recipient: z.enum(['owner','team','target']).optional(), value: expression, condition: expression.optional(),
  stacking: effectDefinitionSchema.shape.stacking.partial().optional(),
});
export const characterMetadataSchema = characterFieldsSchema.pick({ kind: true, id: true, revision: true, identity: true, attributes: true, derivedFrom: true }).extend({
  schemaVersion: z.literal(APP_VERSION), namespace: definitionRefSchema.shape.namespace,
  progression: z.object({ curveIds: z.object({ hp: idSchema, attack: idSchema, defense: idSchema }).strict(), promotion: characterFieldsSchema.shape.progression.shape.promotion }).strict(),
  talents: z.array(z.object(talentSchema.shape).omit({ hits: true, support: true, inputs: true }).extend({ hits: z.array(hit).max(1000),
    inputs: z.array(talentInputSchema.safeExtend({ type: calculationQuantityTypeSchema, source: z.never().optional(),
      constellationLimits: z.array(talentInputSchema.shape.constellationLimits.unwrap().element.omit({ source: true })).max(6).optional() })).max(20).optional() })).max(30),
  passives: z.array(passiveSchema.omit({ support: true, combatRules: true, ruleIds: true }).extend({ effects: ids.optional() })).max(30),
  constellations: z.array(constellationSchema.omit({ support: true, combatRules: true, ruleIds: true }).extend({ effects: ids.optional() })).max(6),
  support: z.record(idSchema, support), contextSupport: idSchema, contextCoverageId: idSchema.optional(), curves: z.record(idSchema, z.array(finiteSchema.nonnegative()).min(91).max(101)).optional(),
  facts: z.record(idSchema, z.object({ scope: z.enum(['owner','recipient','query','team','target','contributor','source-event']), type: calculationValueTypeSchema }).strict()).optional(),
  formulas: z.array(z.object({ id: idSchema, template: formulaDefinitionSchema.shape.template }).strict()).optional(), effects: z.array(effect).optional(), innateEffects: ids.optional(),
}).strict().refine(character => new Set(character.talents.map(skill => skill.id)).size === character.talents.length, '技能身份重复。');
export type CharacterMetadata = z.infer<typeof characterMetadataSchema>;
