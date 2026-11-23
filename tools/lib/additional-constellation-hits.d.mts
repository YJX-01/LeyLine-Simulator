import type { StructuredArtifactSetDefinition, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const additionalConstellationHitIds: string[];
export function auditAdditionalConstellationHits(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[]; sets?: StructuredArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'evaluateStructuredHit'>,
): {
  rows: {
    entity: string;
    field: string;
    sources: string[];
    settings: { hit: string; case?: string; rank?: number; ascension?: number; facts?: Record<string, string | boolean>; element?: string; setId?: string };
    value: number | null;
    expected: number | null;
    required?: string[];
    issue?: string;
  }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; needed: string; reason: string; sources: string[] }[];
  summary: {
    additionalConstellationHitCases: number;
    additionalConstellationHitFailures: number;
    additionalConstellationHitClausesResolved: number;
    additionalConstellationHitClausesVerified: number;
  };
};
