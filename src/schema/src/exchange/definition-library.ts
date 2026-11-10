import { z } from 'zod';
import { idSchema } from '../common/values';
import { ruleDefinitionSchema } from '../project/expressions';
export const definitionLibrarySchema = z.object({
  schemaVersion: z.literal(2), kind: z.literal('definition-library'),
  id: idSchema, name: idSchema, definitions: z.array(ruleDefinitionSchema).max(200),
}).strict();
export type DefinitionLibraryFile = z.infer<typeof definitionLibrarySchema>;
