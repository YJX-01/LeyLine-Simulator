import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { elements } from '../content/stats';
export const enemySchema = z.object({ level: z.number().int().min(1).max(200), resistances: z.record(z.enum(elements), finiteSchema.min(-10).max(10)), defenseReduction: finiteSchema.min(0).max(1), defenseIgnore: finiteSchema.min(0).max(1) }).strict();

export type Enemy = z.infer<typeof enemySchema>;
