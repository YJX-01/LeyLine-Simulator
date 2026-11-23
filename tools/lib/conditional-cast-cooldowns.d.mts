import type { CalculationDiagnostic, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const conditionalCastCooldownCharacterIds: string[];
export const conditionalCastCooldownPeerIds: string[];

interface SourceField {
  entity: string;
  field: string;
  sources: string[];
}

interface ConditionalCastCooldownRow extends SourceField {
  clause: string;
  effect: string;
  output: string;
  value: number | null;
  expected: number | null;
  actualOutput?: number | null;
  status?: string;
  probe?: {
    label: string;
    recipient: string;
    hit: string | null;
    party: string[];
    rank: number;
    ascension: number;
    facts: Record<string, boolean | null>;
    enabled: boolean;
  };
  unexpectedOutputs?: string[];
  issue?: string;
  diagnostics?: CalculationDiagnostic[];
}

export function auditConditionalCastCooldowns(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' |
    'evaluateCombatBindings' | 'calculationEffectInstanceId'>,
): {
  rows: ConditionalCastCooldownRow[];
  verified: Set<string>;
  resolved: (SourceField & { resolved: string; remaining?: string })[];
  gaps: (SourceField & { reason: string })[];
  summary: { conditionalCastCooldownCases: number; conditionalCastCooldownMismatches: number;
    verifiedConditionalCastCooldownModifiers: number; conditionalCastCooldownGaps: number };
};
