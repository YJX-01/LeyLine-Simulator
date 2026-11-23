import type { EquipmentAuditEntities, EquipmentAuditRow } from './equipment-current-facts-audit.mjs';

export function auditAdditionalEquipment(entities: EquipmentAuditEntities, engine: typeof import('@leyline/engine')): {
  rows: Array<EquipmentAuditRow & { value: number | null; expected: number }>;
  verified: Set<string>;
  summary: { additionalEquipmentCases: number; additionalEquipmentMismatches: number; additionalVerifiedEquipmentClauses: number };
};
