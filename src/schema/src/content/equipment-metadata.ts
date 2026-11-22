import { equipmentHitSchema } from './calculation';
import { z } from 'zod';
import { APP_VERSION } from '../version.mjs';
import { idSchema } from '../common/values';
import { definitionRefSchema } from '../calculation/values';
import { calculationCoverageRecordSchema } from '../calculation/coverage';
import { artifactSetFieldsSchema, weaponFieldsSchema } from './entity-fields';
import { buffsSchema, characterMetadataSchema, namedHitBaseSchema, validateMetadataFields } from './character-metadata';

const coverage = z.object(calculationCoverageRecordSchema.shape).pick({ resolution: true, evidence: true, reason: true, mechanisms: true });
const hits = z.array(z.object({ id: idSchema, name: idSchema, element: equipmentHitSchema.shape.element,
  category: equipmentHitSchema.shape.category, accumulate: equipmentHitSchema.shape.accumulate, base: namedHitBaseSchema, family: z.enum(['ordinary', 'resistance-only']), when: z.array(idSchema).optional() }).strict()).optional();
const fields = {
  schemaVersion: z.literal(APP_VERSION), namespace: definitionRefSchema.shape.namespace, revision: idSchema,
  facts: characterMetadataSchema.shape.facts, formulas: characterMetadataSchema.shape.formulas, buffs: buffsSchema,
};
export const weaponMetadataSchema = weaponFieldsSchema.extend({ ...fields, kind: z.literal('weapon-definition'), hits, support: coverage }).strict().superRefine(validateMetadataFields);
export const artifactSetMetadataSchema = artifactSetFieldsSchema.extend({ ...fields, kind: z.literal('artifact-set-definition'),
  rarity: z.number().int().min(1).max(5), effects: z.array(z.object({ pieces: z.number().int().min(1).max(5), buffs: buffsSchema, hits, support: coverage }).strict()).max(5),
}).strict().superRefine(validateMetadataFields);
