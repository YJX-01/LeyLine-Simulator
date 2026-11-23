import type { CalculationDiagnostic, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const directCooldownCharacterIds: string[];
export const directCooldownPeerIds: string[];

interface SourceField {
  entity: string;
  field: string;
  sources: string[];
}

interface DirectCooldownRow extends SourceField {
  clause: string;
  effect: string;
  output: string;
  value: number | null;
  expected: number | null;
  actualOutput?: number | null;
  otherOutput?: number | null;
  expectedOther?: number | null;
  status?: string;
  probe?: {
    label: string;
    recipient: string;
    party: string[];
    caseRank: number;
    caseAscension: number;
    facts?: Record<string, number | boolean | null>;
    active?: boolean;
  };
  issue?: string;
  diagnostics?: CalculationDiagnostic[];
}

export function auditDirectCooldownAmounts(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' |
    'evaluateCombatBindings' | 'calculationEffectInstanceId'>,
): {
  rows: DirectCooldownRow[];
  verified: Set<string>;
  resolved: (SourceField & { resolved: string; remaining?: string })[];
  gaps: (SourceField & { reason: string })[];
  summary: { directCooldownCases: number; directCooldownMismatches: number; verifiedDirectCooldownModifiers: number; directCooldownGaps: number };
};
