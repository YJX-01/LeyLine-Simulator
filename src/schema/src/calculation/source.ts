import { z } from 'zod';
import { idSchema } from '../common/values';

export const calculationSourceSchema = z.discriminatedUnion('kind', [
  z.object({ id: idSchema, kind: z.literal('definition') }).strict(),
  z.object({ id: idSchema, kind: z.literal('repo'), repository: idSchema, commit: idSchema, path: z.string().min(1).max(1000), applicableVersion: idSchema.optional() }).strict(),
  z.object({ id: idSchema, kind: z.literal('document'), url: z.url(), retrievedAt: z.iso.datetime(), applicableVersion: idSchema, adoptionRecord: idSchema.optional() }).strict(),
  z.object({ id: idSchema, kind: z.literal('recording'), reference: idSchema, applicableVersion: idSchema.optional() }).strict(),
  z.object({ id: idSchema, kind: z.literal('author'), name: idSchema, reference: idSchema.optional() }).strict(),
]);
export type SourceRecord = z.infer<typeof calculationSourceSchema>;
