import { characterStatsSchema, type CharacterStats } from '@leyline/schema';

/** ATK% applies to character + weapon base ATK; flat attack is added afterwards. */
export function resolveAttributes(input: CharacterStats): { attack: number } {
  const stats = characterStatsSchema.parse(input);
  return { attack: (stats.characterBaseAttack + stats.weaponBaseAttack) * (1 + stats.attackPercent) + stats.flatAttack };
}
