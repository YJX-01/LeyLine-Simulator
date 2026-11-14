import { z } from 'zod';
import { idSchema } from '../common/values';
import { buildSchema } from '../account/build';
import type { Build } from '../account/build';
import type { EvaluationResult } from './evaluation';

export const loadoutCandidatesSchema = z.array(z.object({
  id: idSchema,
  name: idSchema.optional(),
  replacements: z.array(z.object({ actorId: idSchema, build: buildSchema }).strict()).min(1).max(100)
    .refine(entries => new Set(entries.map(entry => entry.actorId)).size === entries.length, '同一候选不能重复替换队员。'),
}).strict()).min(1).max(20).refine(entries => new Set(entries.map(entry => entry.id)).size === entries.length, '候选标识重复。');
export type LoadoutCandidate = z.infer<typeof loadoutCandidatesSchema>[number];
export interface LoadoutComparison {
  baseline: EvaluationResult;
  candidates: {
    id: string;
    name?: string;
    result: EvaluationResult;
    delta: number | null;
    points: { id: string; before: number | null; after: number | null; delta: number | null }[];
    sources: { added: string[]; removed: string[]; builds: { actorId: string; fields: (keyof Build)[] }[] };
  }[];
}
