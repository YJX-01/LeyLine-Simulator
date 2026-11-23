import type { CalculationDiagnostic, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface RemainingEnergyRow {
  entity: string;
  field: string;
  effect: string;
  output: 'attribute.directEnergyRestored';
  sources: string[];
  probe: { label: string; owner: string; recipient: string; rank: number; ascension: number; application: boolean | null;
    facts: Record<string, boolean | number> };
  expected: number | null;
  expectedStatus: 'known' | 'unknown' | 'invalid';
  value: number | null;
  status: string;
  issue?: string;
  diagnostics?: CalculationDiagnostic[];
}

export function auditRemainingEnergyFacts(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'),
    'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'calculationEffectInstanceId' | 'effectRecipientMatches'>,
): {
  rows: RemainingEnergyRow[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; status: 'timeline-only' | 'unavailable'; reason: string; sources: string[] }[];
  summary: { remainingEnergyCases: number; remainingEnergyMismatches: number; remainingEnergyClausesVerified: number };
};
