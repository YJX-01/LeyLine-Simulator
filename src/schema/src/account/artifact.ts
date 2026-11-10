import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { statSchema } from '../content/stats';
export const artifactItemSchema = z.object({ id: idSchema, inventoryAccountId: idSchema.optional(), setId: idSchema, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), rarity: z.literal(5), level: z.number().int().min(0).max(20), mainStat: statSchema,
  substats: z.array(z.object({ stat: statSchema, value: finiteSchema.nonnegative(), rolls: z.number().int().min(1).max(6).optional() }).strict()).max(4),
  source: z.object({ format: idSchema, key: idSchema, fingerprint: idSchema }).strict().optional(),
}).strict();

export type ArtifactItem = z.infer<typeof artifactItemSchema>;
