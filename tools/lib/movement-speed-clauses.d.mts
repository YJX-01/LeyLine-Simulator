import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const movementSpeedClauseIds: string[];

export function auditMovementSpeedClauses(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: {
    entity: string; clause: string; field: string; effect: string; output: string; sources: string[];
    probe: { label: string; recipient: string }; actual: number | null; value: number | null;
    status: string; expected: number | null; expectedStatus: string; issue?: string;
  }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string }[];
  gaps: { entity: string; field: string; kind: string; sources: string[]; needed: string; reason: string }[];
  summary: { movementSpeedClauseCases: number; movementSpeedClauseMismatches: number; verifiedMovementSpeedClauses: number };
};
