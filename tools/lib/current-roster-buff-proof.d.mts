import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

interface CurrentRosterBuffRow {
  entity: string;
  field: string;
  clause: string;
  source: string;
  settings: {
    attribute: string;
    rank: number;
    ascension: number;
    recipient?: string;
    element?: string;
    category?: string;
    family?: string;
    time?: number;
    facts?: Record<string, boolean | number | string>;
  };
  expected: number;
  value: number | null;
  issue?: string;
}

export const currentRosterBuffIds: string[];
export function auditCurrentRosterBuffs(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: CurrentRosterBuffRow[];
  verified: Set<string>;
  summary: {
    currentRosterBuffCases: number;
    currentRosterBuffFailures: number;
    currentRosterBuffFields: number;
    currentRosterBuffClauses: number;
  };
};
