import { attackSchema, type AttackInput, type AttackResult } from '@leyline/schema';
import { ENGINE_VERSION } from './version';

/** Migrated legacy direct-hit formula; reactions and character mechanics are not included. */
export function calculateAttack(input: unknown): AttackResult {
  return calculateResolvedAttack(attackSchema.parse(input));
}

/** Internal arithmetic for already validated inputs and bounded, accumulated modifiers. */
export function calculateResolvedAttack(config: AttackInput): AttackResult {
  const baseDamage = config.attack * config.multiplier;
  const bonusMultiplier = 1 + config.damageBonus;
  const critMultiplier = config.mode === 'critical' ? 1 + config.critDamage
    : config.mode === 'noncritical' ? 1 : 1 + config.critRate * config.critDamage;
  const enemy = config.enemy;
  const defenseMultiplier = enemy ? (100 + enemy.characterLevel) /
    (100 + enemy.characterLevel + (100 + enemy.enemyLevel) *
      (1 - enemy.defenseReduction) * (1 - enemy.defenseIgnore)) : 1;
  const resistance = enemy?.resistance ?? 0;
  const resistanceMultiplier = resistance < 0 ? 1 - resistance / 2
    : resistance < 0.75 ? 1 - resistance : 1 / (1 + 4 * resistance);
  return {
    versions: { schema: 1, engine: ENGINE_VERSION, rules: enemy ? 'legacy-direct-hit-v1' : 'formula-sandbox-v1', data: 'synthetic-v1' },
    baseDamage, bonusMultiplier, critMultiplier, defenseMultiplier, resistanceMultiplier,
    damage: baseDamage * bonusMultiplier * critMultiplier * defenseMultiplier * resistanceMultiplier,
  };
}

