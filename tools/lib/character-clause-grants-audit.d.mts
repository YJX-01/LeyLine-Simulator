import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const characterClauseAuditIds: string[];
export function auditCharacterClauseGrants(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'),
    'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'evaluateStructuredHit'>,
): {
  rows: { entity: string; field: string; settings: object; value: number | null; expected: number | null; issue?: string }[];
  verified: string[];
  summary: { characterClauseGrantCases: number; characterClauseGrantFailures: number; characterClauseGrantsVerified: number };
};
