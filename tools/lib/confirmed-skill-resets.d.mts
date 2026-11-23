import type { CalculationDiagnostic, StructuredArtifactSetDefinition, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const confirmedSkillResetCharacterIds: string[];
export const confirmedSkillResetWeaponHolders: Record<string, string>;

interface SourceField {
  entity: string;
  field: string;
  sources: string[];
}

interface ConfirmedSkillResetRow extends SourceField {
  clause: string;
  effect: string;
  output: string;
  probe: string;
  expected: number | null;
  value: number | null;
  status: string;
  cooldownAfterMs?: number;
  issue?: string;
  diagnostics?: CalculationDiagnostic[];
}

export function auditConfirmedSkillResets(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[]; sets?: StructuredArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' |
    'evaluateCombatBindings' | 'calculationEffectInstanceId'>,
): {
  rows: ConfirmedSkillResetRow[];
  verified: Set<string>;
  resolved: (SourceField & { resolved: string; remaining?: string })[];
  gaps: (SourceField & { reason: string })[];
  summary: { confirmedSkillResetCases: number; confirmedSkillResetMismatches: number;
    confirmedSkillResetClausesVerified: number; confirmedSkillResetGaps: number };
};
