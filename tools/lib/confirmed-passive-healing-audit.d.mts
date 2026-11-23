import type { StructuredArtifactSetDefinition, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const confirmedPassiveHealingIds: string[];
export const confirmedPassiveHealingSupportIds: string[];
export const confirmedPassiveHealingWeaponIds: string[];
export const confirmedPassiveHealingSetIds: string[];

export function auditConfirmedPassiveHealing(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[]; sets?: StructuredArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'evaluateTimeline'>,
): Promise<{
  rows: { entity: string; field: string; healId: string; scenario: string; source: string; recipient?: string;
    expectedStatus?: string; actualStatus?: string | null; expected?: number | null; actual?: number | null; issue?: string }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; kind: string; sources: string[]; needed: string; reason: string }[];
  summary: { confirmedPassiveHealingClauses: number; confirmedPassiveHealingScenarios: number; confirmedPassiveHealingFailures: number };
}>;
