import type { StructuredArtifactSetDefinition, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const remainingPartyDefenseIds: string[];

export function auditRemainingPartyDefense(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[]; sets?: StructuredArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'evaluateTimeline'>,
): Promise<{
  rows: { entity: string; field: string; output: string; probe: object; sources: string[]; expected: number | null;
    expectedStatus: string; value: number | null; status: string; issue?: string }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; kind: string; sources: string[]; needed: string; reason: string }[];
  summary: { remainingPartyDefenseCases: number; remainingPartyDefenseMismatches: number; verifiedRemainingPartyDefense: number };
}>;
