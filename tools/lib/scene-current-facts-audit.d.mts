import type { SceneDefinition } from '@leyline/schema';
import type { EquipmentAuditEntities, EquipmentAuditRow } from './equipment-current-facts-audit.mjs';

export function auditCurrentScene(definition: SceneDefinition | undefined, source: { entity: string; field: string; text: string } | undefined,
  entities: EquipmentAuditEntities, engine: typeof import('@leyline/engine')): { rows: EquipmentAuditRow[]; gaps: EquipmentAuditRow[] } | undefined;
