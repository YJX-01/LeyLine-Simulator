import type * as Engine from '@leyline/engine';
import type { CalculationDiagnostic, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const mityaSteadyCoreCharacterIds: string[];
export const mityaSteadyCoreWeaponIds: string[];
export function auditMityaSteadyCore(entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof Engine, 'prepareStructuredBuilds' | 'evaluateStructuredHit'>): {
    rows: { entity: string; field: string; pointer: string; output: string; sources: string[]; issue?: string; diagnostics?: CalculationDiagnostic[];
      probe: { rank: number; hitId: string; mode: string; beacons: number; excess: boolean; consumed: boolean; attachments: number;
        dealerId: string; overlapping: boolean }; expected: number | null; value: number | null; status: string;
      expectedMultiplier: number | null; multiplier: number | null; expectedBase: number | null; base: number | null;
      expectedElevation: number | null; elevation: number | null }[];
    verified: Set<string>;
    resolved: { entity: string; field: string; resolved: string; remaining: string }[];
    gaps: { entity: string; field: string; reason: string; sources: string[] }[];
    summary: { mityaSteadyCoreCases: number; mityaSteadyCoreMismatches: number; verifiedMityaSteadyCore: number };
  };
