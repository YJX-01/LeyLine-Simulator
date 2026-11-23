import type { registeredModifierEvidence } from './registered-modifier-evidence.mjs';

type Entities = Parameters<typeof registeredModifierEvidence>[0];
type Results = Parameters<typeof registeredModifierEvidence>[1];
type Proofs = ReturnType<typeof registeredModifierEvidence>;

export function physicalDamageModifierNumbers(
  entities: Pick<Entities, 'characters' | 'weapons'>,
  results: Pick<Results, 'calculator'> & { registeredModifierEvidence?: Pick<Proofs[number], 'key'>[] },
  engine: typeof import('@leyline/engine'),
): Proofs;
