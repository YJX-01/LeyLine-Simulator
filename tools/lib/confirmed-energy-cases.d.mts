import type { CalculationDiagnostic, CalculationFact, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface ConfirmedEnergyRow {
  entity: string;
  field: string;
  effect: string;
  output: 'attribute.directEnergyRestored';
  sources: string[];
  probe: { label: string; owner: string; recipient: string; triggerActor: string; rank: number; refinement: number; weapon: string;
    facts: [string, string, CalculationFact][]; application: boolean | null };
  expected: number | null;
  expectedStatus: 'known' | 'unknown' | 'invalid' | 'rejected';
  value: number | null;
  status: string;
  issue?: string;
  diagnostics?: CalculationDiagnostic[];
}

export function auditConfirmedEnergyCases(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'),
    'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'calculationEffectInstanceId' | 'effectRecipientMatches'>,
): {
  rows: ConfirmedEnergyRow[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; reason: string; status: 'timeline-only' }[];
  summary: { confirmedEnergyCases: number; confirmedEnergyMismatches: number; confirmedEnergyClausesVerified: number };
};
