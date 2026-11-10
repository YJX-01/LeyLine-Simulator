import { z } from 'zod';
import { idSchema,finiteSchema } from '../common/values';
import { statSchema } from './stats';
import { artifactSetDefinitionSchema } from './artifact-set';
export { weaponDefinitionSchema as weaponMetadataSchema } from './weapon';
export const artifactSetMetadataSchema = artifactSetDefinitionSchema.extend({rarity:z.number().int().min(1).max(5)});
export const artifactMainMetadataSchema = z.record(statSchema,z.array(finiteSchema.nonnegative()).length(21));
const ids=z.array(idSchema.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).min(1).max(10000).refine(items=>new Set(items).size===items.length,'内容标识重复。');
export const contentManifestSchema=z.object({schemaVersion:z.literal(1),dataVersion:idSchema,repository:idSchema,commit:idSchema,characters:ids,weapons:ids,sets:ids}).strict();
