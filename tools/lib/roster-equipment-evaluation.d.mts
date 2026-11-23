import type { EquipmentAuditEntities, EquipmentAuditRow } from './equipment-current-facts-audit.mjs';
import type { RosterReplayQuery } from './roster-evaluation.mjs';

interface ModifierReading {
  id: string;
  amount: number | null;
  conditionExcluded?: boolean;
  recipient?: string;
  sourceValue?: number | null;
  issue?: string;
}

interface ProbeRow extends EquipmentAuditRow {
  refinement?: number;
  value: number | null;
  independentClause: boolean;
  modifiers: ModifierReading[];
}

export function rosterEquipmentEvaluation(entities: EquipmentAuditEntities, engine: typeof import('@leyline/engine'),
  observationUnits: typeof import('@leyline/schema').combatObservationUnits, onQuery?: (query: RosterReplayQuery) => void,
  verified?: ReadonlySet<string>): {
  rows: ProbeRow[];
  gaps: (ProbeRow & { reasons: string[] })[];
  summary: { equipmentMismatches: number; equipmentMissingValues: number; modifierMismatches: number; unverifiedEquipmentModifiers: number };
};
