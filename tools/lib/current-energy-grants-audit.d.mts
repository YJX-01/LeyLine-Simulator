import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface EnergyGrantAuditRow {
  entity: string;
  field: string;
  effect: string;
  attribute: string;
  sources: string[];
  probe: string;
  recipient: string;
  constellation: number;
  ascension: number;
  expected: number | null;
  value: number | null;
  issue?: string;
}

export const currentEnergyGrantAuditCharacterIds: string[];
export function auditCurrentEnergyGrants(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'),
    'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'calculationEffectInstanceId' | 'effectRecipientMatches'>,
): {
  rows: EnergyGrantAuditRow[];
  verified: Set<string>;
  summary: { currentEnergyCases: number; currentEnergyMismatches: number; verifiedEnergyClauses: number };
  gaps: { entity: string; field: string; reason: string }[];
};
