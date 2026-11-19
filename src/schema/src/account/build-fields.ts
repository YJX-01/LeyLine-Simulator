import { z } from 'zod';
import { idSchema } from '../common/values';
import { artifactMainTableSchema } from '../content/artifact-rarity';

export const buildFieldsSchema = z.object({
  dataVersion: idSchema, artifactMain: artifactMainTableSchema,
  level: z.number().int().min(1).max(100).refine(value => value <= 90 || value === 95 || value === 100, '角色等级须为1–90、95或100'),
  ascension: z.number().int().min(0).max(6), constellation: z.number().int().min(0).max(6),
  talents: z.object({ normal: z.number().int().min(1).max(15), skill: z.number().int().min(1).max(15), burst: z.number().int().min(1).max(15) }).strict(),
  weaponLevel: z.number().int().min(1).max(90), weaponAscension: z.number().int().min(0).max(6), refinement: z.number().int().min(1).max(5),
}).strict();
