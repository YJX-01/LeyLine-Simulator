import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface ShieldAbsorptionRow {
  entity: string;
  field: string;
  attribute: string;
  sources: string[];
  expected: number | null;
  value: number | null;
  status: string;
  issue?: string;
}

export function auditShieldAbsorption(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: ShieldAbsorptionRow[];
  verified: Set<string>;
  summary: { shieldAbsorptionCases: number; shieldAbsorptionMismatches: number; verifiedShieldAbsorptionDetails: number };
};
