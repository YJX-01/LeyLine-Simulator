import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';
import type { registeredModifierEvidence } from './registered-modifier-evidence.mjs';

type RegisteredResults = Parameters<typeof registeredModifierEvidence>[1];
type ModifierEvidence = ReturnType<typeof registeredModifierEvidence>;

export function auditLastCharacterModifierCases(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: typeof import('@leyline/engine'),
  results: Pick<RegisteredResults, 'calculator'> & { registeredModifierEvidence?: Pick<ModifierEvidence[number], 'key'>[] },
): ModifierEvidence;
