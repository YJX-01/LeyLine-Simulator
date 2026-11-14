import { z } from 'zod';
import { idSchema, finiteSchema, contentSourceSchema, supportSchema } from '../common/values';
import { modifierSchema } from './effects';
import { statSchema } from './stats';
import { combatRulesSchema } from './combat-rules';
const curve = z.array(finiteSchema).min(91).max(101);
export const weaponDefinitionSchema = z.object({ id: idSchema, name: idSchema, weaponType: idSchema, rarity: z.number().int().min(1).max(5),
  baseAttack: finiteSchema, baseStat: finiteSchema, stat: statSchema,
  attackCurve: curve, statCurve: curve, promotion: z.array(finiteSchema).min(5).max(8),
  modifiers: z.array(modifierSchema).max(30), combatRules: combatRulesSchema.optional(),
  passive: z.object({ kind: z.literal('none'), sources: z.array(contentSourceSchema).min(1).max(10) }).strict().optional(),
  support: supportSchema, source: contentSourceSchema,
}).strict().refine(weapon => weapon.passive?.kind !== 'none' || (!weapon.modifiers.length && !weapon.combatRules?.length), '已核验无被动的武器不得携带效果规则。');

export type WeaponDefinition = z.infer<typeof weaponDefinitionSchema>;
