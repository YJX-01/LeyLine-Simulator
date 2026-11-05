import { attackSchema, type AttackResult } from '@leyline/schema';

/** Formula sandbox only: excludes enemy defense, resistance, reactions and buffs. */
export function calculateAttack(input: unknown): AttackResult {
  const config = attackSchema.parse(input);
  const baseDamage = config.attack * config.multiplier;
  const bonusMultiplier = 1 + config.damageBonus;
  const critMultiplier = config.mode === 'critical' ? 1 + config.critDamage
    : config.mode === 'noncritical' ? 1 : 1 + config.critRate * config.critDamage;
  return {
    versions: { schema: 1, engine: '0.1.0', rules: 'formula-sandbox-v1', data: 'synthetic-v1' },
    baseDamage, bonusMultiplier, critMultiplier,
    damage: baseDamage * bonusMultiplier * critMultiplier,
  };
}
