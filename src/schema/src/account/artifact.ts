import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { statSchema } from '../content/stats';
import { artifactRaritySchema, artifactMaxLevel, artifactInitialSubstatCounts, type ArtifactRarity } from '../content/artifact-rarity';
export function validateArtifactEnhancement(artifact: { rarity: ArtifactRarity; level: number; substats: { rolls?: number }[] }, context: z.RefinementCtx): void {
  if (artifact.level > artifactMaxLevel(artifact.rarity)) context.addIssue({ code: 'custom', path: ['level'], message: '强化等级超出所选星级上限。' });
  if (artifact.rarity === 4) {
    const upgrades = Math.floor(artifact.level / 4);
    const initialCounts = artifactInitialSubstatCounts(artifact.rarity).filter(initial => Math.min(4, initial + upgrades) === artifact.substats.length);
    if (!initialCounts.length) context.addIssue({ code: 'custom', path: ['substats'], message: '四星圣遗物的词条数量与强化等级不匹配。' });
    if (artifact.substats.some(sub => sub.rolls !== undefined && sub.rolls > Math.max(1, upgrades))) context.addIssue({ code: 'custom', path: ['substats'], message: '四星圣遗物的单词条强化次数越界。' });
    if (artifact.substats.every(sub => sub.rolls !== undefined) && !initialCounts.some(initial => initial + upgrades === artifact.substats.reduce((total, sub) => total + sub.rolls!, 0))) context.addIssue({ code: 'custom', path: ['substats'], message: '四星圣遗物的强化记录总量与等级不匹配。' });
  }
}
export const artifactItemSchema = z.object({ id: idSchema, setId: idSchema, slot: z.enum(['flower', 'plume', 'sands', 'goblet', 'circlet']), rarity: artifactRaritySchema, level: z.number().int().min(0).max(20), mainStat: statSchema,
  substats: z.array(z.object({ stat: statSchema, value: finiteSchema.nonnegative(), rolls: z.number().int().min(1).max(6).optional() }).strict()).max(4),
  source: z.object({ format: idSchema, key: idSchema, fingerprint: idSchema }).strict().optional(),
}).strict().superRefine(validateArtifactEnhancement);

export type ArtifactItem = z.infer<typeof artifactItemSchema>;
