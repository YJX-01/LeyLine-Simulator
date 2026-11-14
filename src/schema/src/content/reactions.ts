import { z } from 'zod';
import { contentSourceSchema, finiteSchema, idSchema } from '../common/values';

export const hitReactionTypes = ['vaporize', 'melt', 'aggravate', 'spread'] as const;
export const hitReactionSchema = z.object({
  type: z.enum(hitReactionTypes),
  trigger: z.literal('record-owner').nullable(),
}).strict();
export type HitReaction = z.infer<typeof hitReactionSchema>;
export type HitReactionType = HitReaction['type'];
export const reactionBonusKeys = ['vaporizeReactionBonus', 'meltReactionBonus', 'aggravateReactionBonus', 'spreadReactionBonus'] as const;
export type ReactionBonusKey = typeof reactionBonusKeys[number];

const positive = finiteSchema.positive();
export const reactionRulesSchema = z.object({
  schemaVersion: z.literal(1), id: z.literal('standard-hit-reactions'), revision: idSchema,
  sources: z.object({ levels: contentSourceSchema, amplifying: contentSourceSchema, additive: contentSourceSchema }).strict(),
  levelMultipliers: z.array(positive.nullable()).length(101),
  amplifying: z.object({
    emNumerator: positive, emDenominator: positive,
    vaporize: z.object({ hydro: positive, pyro: positive }).strict(),
    melt: z.object({ pyro: positive, cryo: positive }).strict(),
  }).strict(),
  additive: z.object({ emNumerator: positive, emDenominator: positive, aggravate: positive, spread: positive }).strict(),
}).strict().refine(rules => rules.levelMultipliers[0] === null, '反应等级0必须明确不可用。');
export type ReactionRules = z.infer<typeof reactionRulesSchema>;
