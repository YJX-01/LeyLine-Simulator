import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { modifierSchema } from './effects';
import { statSchema } from './stats';
const curve = z.array(finiteSchema).min(91).max(101);
export const weaponDefinitionSchema = z.object({ id: idSchema, name: idSchema, weaponType: idSchema, rarity: z.number().int().min(1).max(5),
  baseAttack: finiteSchema, baseStat: finiteSchema, stat: statSchema,
  attackCurve: curve, statCurve: curve, promotion: z.array(finiteSchema).min(5).max(8),
  modifiers: z.array(modifierSchema).max(30), support: supportSchema, source: contentSourceSchema,
}).strict();

export type WeaponDefinition = z.infer<typeof weaponDefinitionSchema>;
