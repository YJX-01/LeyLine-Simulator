import type { EquipmentAuditEntities, EquipmentAuditRow } from './equipment-current-facts-audit.mjs';

export function auditRemainingEquipmentCases(entities: EquipmentAuditEntities, engine: typeof import('@leyline/engine')): {
  rows: Array<EquipmentAuditRow & { value: number | null; expected: number | null }>;
  verified: Set<string>;
  gaps: Array<{ entity: string; field: string; reason: string }>;
  summary: { remainingEquipmentCases: number; remainingEquipmentMismatches: number; remainingVerifiedEquipmentClauses: number };
};
