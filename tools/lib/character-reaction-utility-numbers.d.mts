import type { registeredModifierEvidence } from './registered-modifier-evidence.mjs';

type Entities = Parameters<typeof registeredModifierEvidence>[0];
type Results = Parameters<typeof registeredModifierEvidence>[1];
type ModifierEvidence = ReturnType<typeof registeredModifierEvidence>;

export function characterReactionUtilityNumbers(
  entities: Pick<Entities, 'characters' | 'weapons'>,
  results: Results & { registeredModifierEvidence?: Pick<ModifierEvidence[number], 'key'>[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'calculationEffectInstanceId'>,
): ModifierEvidence;
