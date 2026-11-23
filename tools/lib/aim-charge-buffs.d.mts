import type { CalculationDiagnostic, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const aimChargeIds: string[];
export const aimChargePeerIds: string[];

export function auditAimChargeBuffs(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'projectCalculationEvent' | 'evaluateCombatBindings'>,
): {
  rows: {
    entity: string; clause: string; field: string; effect: string; output: string; sources: string[];
    value: number | null; expected: number | null; actualOutput: number | null; expectedOutput: number | null; status: string;
    probe: { label: string; recipient: string; hitId: string; ascension: number; constellation: number; timeMs: number;
      conditions: Record<string, boolean | null>; casts: { actor?: string; skillId: string; timeMs: number }[] };
    issue?: string; diagnostics?: CalculationDiagnostic[];
  }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; sources: string[]; resolved: string; remaining?: string }[];
  gaps: { entity: string; field: string; sources: string[]; reason: string }[];
  summary: { aimChargeCases: number; aimChargeMismatches: number; verifiedAimChargeFields: number; aimChargeGaps: number };
};
