import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

export const characterInterruptionResistanceIds: string[];
export const characterInterruptionResistancePeerIds: string[];

export function auditCharacterInterruptionResistance(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: { entity: string; field: string; output: string; modifierId: string; probe: { label: string; recipient?: string;
    hitId?: string; ascension: number; constellation: number; otherMultiplier?: number }; sources: string[]; expected: number | null;
    expectedStatus: string; expectedContribution: number | null; value: number | null; status: string; contribution: number | null; issue?: string }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; sources: string[]; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; kind: string; sources: string[]; needed: string; reason: string }[];
  summary: { characterInterruptionResistanceCases: number; characterInterruptionResistanceMismatches: number; verifiedCharacterInterruptionResistance: number };
};
