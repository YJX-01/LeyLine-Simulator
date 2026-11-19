import { z } from 'zod';
import { idSchema } from '../common/values';
import { definitionRefSchema } from './values';

export const calculationClosureRequestSchema = z.object({ roots: z.array(definitionRefSchema).max(20000),
  sourceIds: z.array(idSchema).max(20000), families: z.array(idSchema).max(1000) }).strict();
