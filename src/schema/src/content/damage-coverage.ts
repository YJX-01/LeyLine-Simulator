import { z } from 'zod';
import { contentSourceSchema, idSchema } from '../common/values';
import type { CharacterDefinition } from './character';
import type { DamageRequest } from '../project/damage';

/** An authored review of one damage path, carried by the definition snapshot. */
export const damageCoverageSchema = z.object({
  id: idSchema,
  revision: idSchema,
  skillId: idSchema,
  hitIndices: z.array(z.number().int().min(0).max(29)).min(1).max(30),
  maxConstellation: z.number().int().min(0).max(6),
  sources: z.array(contentSourceSchema).min(1).max(10),
  branches: z.array(z.object({
    id: idSchema,
    resolution: z.enum(['irrelevant', 'explicit-input', 'talent-level']),
    reason: z.string().min(1).max(2000),
  }).strict()).min(1).max(40),
}).strict().refine(proof => new Set(proof.hitIndices).size === proof.hitIndices.length
  && new Set(proof.branches.map(branch => branch.id)).size === proof.branches.length, '查询覆盖的命中或审阅分支重复。');

export function findDamageCoverage(character: CharacterDefinition, constellation: number, damage?: Pick<DamageRequest, 'skillId' | 'hitIndex'>) {
  if (!damage) return undefined;
  return character.damageCoverage?.find(proof => {
    if (proof.revision !== character.revision || proof.skillId !== damage.skillId
      || !proof.hitIndices.includes(damage.hitIndex) || constellation > proof.maxConstellation) return false;
    const reviewed = new Set(proof.branches.map(branch => branch.id));
    return reviewed.has('base') && character.passives.every(passive => reviewed.has(passive.id))
      && character.constellations.filter(item => item.rank <= constellation).every(item => reviewed.has(`constellation:${item.rank}`));
  });
}
