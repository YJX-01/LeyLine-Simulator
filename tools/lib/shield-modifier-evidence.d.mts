import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';
import type { registeredModifierEvidence } from './registered-modifier-evidence.mjs';

type RegisteredResults = Parameters<typeof registeredModifierEvidence>[1];
type ModifierEvidence = ReturnType<typeof registeredModifierEvidence>;

export function shieldModifierEvidence(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  results: RegisteredResults & { registeredModifierEvidence?: Pick<ModifierEvidence[number], 'key'>[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): ModifierEvidence;
