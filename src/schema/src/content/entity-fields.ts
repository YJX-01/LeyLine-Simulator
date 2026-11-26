import { z } from 'zod';
import { finiteSchema, idSchema } from '../common/values';
import { elements, statSchema } from './stats';
import { artifactSlotSchema } from './artifact-rarity';

const curve = z.array(finiteSchema.nonnegative()).min(91).max(101);
export const characterFieldsSchema = z.object({
  kind: z.literal('character-definition'), id: idSchema, revision: idSchema, dataVersion: idSchema, origin: z.enum(['builtin', 'custom']),
  derivedFrom: z.object({ id: idSchema, name: idSchema, revision: idSchema.optional() }).strict().optional(),
  identity: z.object({ name: idSchema, title: z.string().max(500), description: z.string().max(40000), element: z.enum(elements), weaponType: idSchema,
    rarity: z.number().int().min(1).max(5).nullable(), gameId: z.number().int().positive().optional(), region: z.string().max(160).optional(),
    notes: z.array(z.string().min(1).max(1000)).max(20).optional() }).strict(),
  attributes: z.object({ base: z.object({ hp: finiteSchema.positive(), attack: finiteSchema.nonnegative(), defense: finiteSchema.nonnegative(), critRate: finiteSchema.nonnegative(), critDamage: finiteSchema.nonnegative(), elementalMastery: finiteSchema.nonnegative().optional() }).strict(), specialized: statSchema }).strict(),
  progression: z.object({ curves: z.object({ hp: curve, attack: curve, defense: curve }).strict(),
    promotion: z.array(z.object({ maxLevel: finiteSchema, hp: finiteSchema, attack: finiteSchema, defense: finiteSchema, specialized: finiteSchema }).strict()).min(7).max(8) }).strict(),
}).strict();
export const weaponFieldsSchema = z.object({
  maxRefinement: z.number().int().min(1).max(5).optional(),
  id: idSchema, name: idSchema, weaponType: idSchema, rarity: z.number().int().min(1).max(5), baseAttack: finiteSchema, baseStat: finiteSchema, stat: statSchema,
  attackCurve: curve, statCurve: curve, promotion: z.array(finiteSchema).min(5).max(8),
}).strict();
export const artifactSetFieldsSchema = z.object({
  id: idSchema, name: idSchema, slots: z.array(artifactSlotSchema).min(1).max(5).refine(values => new Set(values).size === values.length, '套装部位重复。'),
  rarities: z.array(z.number().int().min(1).max(5)).min(1).max(5).refine(values => new Set(values).size === values.length, '套装星级重复。'),
}).strict();
