import { equipmentHitSchema } from './calculation';
import { z } from 'zod';
import { APP_VERSION } from '../version.mjs';
import { idSchema } from '../common/values';
import { definitionRefSchema } from '../calculation/values';
import { calculationCoverageRecordSchema } from '../calculation/coverage';
import { artifactSetFieldsSchema, weaponFieldsSchema } from './entity-fields';
import { calculatorDisplaySchema, validateCalculatorDisplay } from './calculator-display';
import { buffsSchema, buffExpressionSchema, characterMetadataSchema, namedHitBaseSchema, validateMetadataFields } from './character-metadata';

const coverage = z.object(calculationCoverageRecordSchema.shape).pick({ resolution: true, evidence: true, reason: true, mechanisms: true });
const hits = z.array(z.object({ id: idSchema, name: idSchema, element: equipmentHitSchema.shape.element,
  category: equipmentHitSchema.shape.category, critical: equipmentHitSchema.shape.critical, reactions: equipmentHitSchema.shape.reactions, accumulate: equipmentHitSchema.shape.accumulate,
  base: namedHitBaseSchema, family: z.enum(['ordinary', 'resistance-only']), when: z.array(z.union([idSchema, buffExpressionSchema])).optional() }).strict()).optional();
const fields = {
  schemaVersion: z.literal(APP_VERSION), namespace: definitionRefSchema.shape.namespace, revision: idSchema,
  calculator: calculatorDisplaySchema.optional(),
  facts: characterMetadataSchema.shape.facts, formulas: characterMetadataSchema.shape.formulas, buffs: buffsSchema,
};
export const weaponMetadataSchema = weaponFieldsSchema.extend({ ...fields, kind: z.literal('weapon-definition'), hits, support: coverage }).strict()
  .superRefine(validateMetadataFields).superRefine((weapon, ctx) => validateCalculatorDisplay(weapon.calculator, [weapon], ctx));
export const artifactSetMetadataSchema = artifactSetFieldsSchema.extend({ ...fields, kind: z.literal('artifact-set-definition'),
  rarity: z.number().int().min(1).max(5), effects: z.array(z.object({ pieces: z.number().int().min(1).max(5), buffs: buffsSchema, hits, support: coverage }).strict()).max(5),
}).strict().superRefine(validateMetadataFields).superRefine((set, ctx) => validateCalculatorDisplay(set.calculator, [set, ...set.effects], ctx));
