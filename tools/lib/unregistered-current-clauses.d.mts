import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

type Finding = { entity: string; field: string; sources: string[]; reason: string; needed: string };

export const unregisteredCurrentClauseIds: string[];
export function auditUnregisteredCurrentClauses(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'),
    'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'evaluateStructuredHit'>,
): {
  rows: { entity: string; field: string; sources: string[]; settings: object; value: number | null; expected: number; issue?: string }[];
  verified: Set<string>;
  summary: { unregisteredCurrentClauseCases: number; unregisteredCurrentClauseFailures: number; unregisteredCurrentClausesVerified: number };
  gaps: Finding[];
  timing: Finding[];
  indirect: Finding[];
};
