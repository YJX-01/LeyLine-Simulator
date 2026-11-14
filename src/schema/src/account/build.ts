import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { characterDefinitionSchema } from '../content/character';
import { weaponDefinitionSchema } from '../content/weapon';
import { artifactSetDefinitionSchema } from '../content/artifact-set';
import { artifactItemSchema } from './artifact';
import { statSchema } from '../content/stats';
import { reactionRulesSchema } from '../content/reactions';
export const buildSchema = z.object({ dataVersion: idSchema, inventoryAccountId: idSchema.optional(), character: characterDefinitionSchema, weapon: weaponDefinitionSchema, sets: z.array(artifactSetDefinitionSchema).max(100),
  artifactMain: z.record(statSchema, z.array(finiteSchema).length(21)), reactionRules: reactionRulesSchema.optional(),
  level: z.number().int().min(1).max(100).refine(value => value <= 90 || value === 95 || value === 100, '角色等级须为1–90、95或100'), ascension: z.number().int().min(0).max(6), constellation: z.number().int().min(0).max(6),
  talents: z.object({ normal: z.number().int().min(1).max(15), skill: z.number().int().min(1).max(15), burst: z.number().int().min(1).max(15) }).strict(),
  weaponLevel: z.number().int().min(1).max(90), weaponAscension: z.number().int().min(0).max(6), refinement: z.number().int().min(1).max(5),
  artifacts: z.array(artifactItemSchema).max(5),
}).strict();

export type Build = z.infer<typeof buildSchema>;
