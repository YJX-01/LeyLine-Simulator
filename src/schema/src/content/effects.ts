import { z } from 'zod';
import { statSchema } from './stats';
import { finiteSchema } from '../common/values';
export const modifierSchema = z.object({ stat: statSchema, values: z.array(finiteSchema).min(1).max(5), category: z.enum(['normal', 'skill', 'burst']).optional(), minAscension: z.number().int().min(0).max(6).optional(), hpAbove: finiteSchema.optional() }).strict();
export type Modifier = z.infer<typeof modifierSchema>;
