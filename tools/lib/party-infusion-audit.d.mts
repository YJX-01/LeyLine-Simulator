import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '../../src/schema/src/index';
import type { evaluateTimeline } from '../../src/engine/src/index';

export function auditPartyInfusion(entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: { evaluateTimeline: typeof evaluateTimeline }): {
    rows: { entity: string; field: string; probe: string; value: number | null; expected: number | null; issue?: string }[];
    verified: Set<string>;
    summary: { cases: number; verified: number; failures: number };
  };
