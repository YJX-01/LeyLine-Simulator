import { z } from 'zod';
import { statSchema } from './stats';
import { finiteSchema } from '../common/values';
export const attackTypeSchema = z.enum(['normal', 'charged', 'plunge', 'skill', 'burst']);
export type AttackType = z.infer<typeof attackTypeSchema>;
export const modifierSchema = z.object({ stat: statSchema, values: z.array(finiteSchema).min(1).max(5), category: attackTypeSchema.optional(), minAscension: z.number().int().min(0).max(6).optional(), hpAbove: finiteSchema.optional() }).strict();
export type Modifier = z.infer<typeof modifierSchema>;
