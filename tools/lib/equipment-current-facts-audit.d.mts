import type { ArtifactSetDefinition, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

export interface EquipmentAuditEntities {
  characters: CharacterDefinition[];
  weapons: WeaponDefinition[];
  sets: ArtifactSetDefinition[];
}

export interface EquipmentAuditRow {
  entity: string;
  field: string;
  issue?: string;
}

export function auditEquipmentCurrentFacts(entities: EquipmentAuditEntities, engine: typeof import('@leyline/engine')): {
  rows: EquipmentAuditRow[];
  verified: Set<string>;
  summary: { currentEquipmentCases: number; currentEquipmentMismatches: number; verifiedEquipmentClauses: number };
};
