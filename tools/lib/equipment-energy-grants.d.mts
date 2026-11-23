import type { ArtifactSetDefinition, CalculationDiagnostic, CalculationFact, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface EquipmentEnergyRow {
  entity: string;
  field: string;
  effect: string;
  output: 'attribute.directEnergyRestored' | 'attribute.directEnergyChange';
  value: number | null;
  expected: number | null;
  expectedStatus: 'known' | 'unknown' | 'invalid' | 'rejected';
  status: string;
  sources: string[];
  probe: { label: string; owner: string; refinement: number; pieces?: number; recipient: string; equipped: boolean;
    onField: boolean; application: boolean | null; flags: Record<string, CalculationFact> };
  issue?: string;
  diagnostics?: CalculationDiagnostic[];
}

export const equipmentEnergyWeaponIds: string[];
export const equipmentEnergySetIds: string[];
export const equipmentEnergyCharacterIds: string[];

export function auditEquipmentEnergyGrants(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext'
    | 'evaluateCombatBindings' | 'calculationEffectInstanceId' | 'effectRecipientMatches'>,
): {
  rows: EquipmentEnergyRow[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; reason: string; status: 'timeline-only'; sources: string[] }[];
  summary: { equipmentEnergyCases: number; equipmentEnergyMismatches: number; equipmentEnergyClausesVerified: number };
};
