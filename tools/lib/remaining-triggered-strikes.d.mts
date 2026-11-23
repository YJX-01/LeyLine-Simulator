import type { StructuredArtifactSetDefinition, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const remainingTriggeredStrikeIds: string[];
export function auditRemainingTriggeredStrikes(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[]; sets?: StructuredArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'evaluateStructuredHit'>,
): {
  rows: {
    entity: string; field: string; sources: string[]; settings: { hit?: string; character: string; refinement?: number };
    value: number | null; expected: number | null; issue?: string;
  }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; needed: string; reason: string; sources: string[] }[];
  summary: { remainingTriggeredStrikeCases: number; remainingTriggeredStrikeFailures: number;
    remainingTriggeredStrikeClausesVerified: number; remainingTriggeredStrikeClausesResolved: number };
};
