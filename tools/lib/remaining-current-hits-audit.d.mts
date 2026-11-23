import type { StructuredArtifactSetDefinition, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const remainingCurrentHitIds: string[];
export function auditRemainingCurrentHits(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[]; sets: StructuredArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'),
    'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'evaluateStructuredHit'>,
): {
  rows: { entity: string; field: string; sources: string[]; settings: object; value: number | null; expected: number | null; issue?: string }[];
  verified: Set<string>;
  summary: { remainingCurrentHitCases: number; remainingCurrentHitFailures: number; remainingCurrentHitClausesVerified: number };
};
