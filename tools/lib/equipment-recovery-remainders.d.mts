import type { ArtifactSetDefinition, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface EquipmentRecoveryField {
  entity: string;
  field: string;
  output: string;
  sources: string[];
}

interface EquipmentRecoveryCase extends EquipmentRecoveryField {
  effect: string;
  probe: string;
  recipient: string;
  refinement: number;
  pieces?: number;
  expected: number | null;
  value: number | null;
  state: string;
  issue?: string;
}

export const equipmentRecoveryCharacterIds: string[];
export const equipmentRecoveryWeaponIds: string[];
export const equipmentRecoverySetIds: string[];
export function auditEquipmentRecoveryRemainders(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'
    | 'calculationEffectInstanceId' | 'grantedBuildEffects'>,
): {
  rows: EquipmentRecoveryCase[];
  verified: Set<string>;
  resolved: (EquipmentRecoveryField & { resolved: string; remaining: string | null })[];
  gaps: (EquipmentRecoveryField & { reason: string })[];
  summary: { equipmentRecoveryCases: number; equipmentRecoveryMismatches: number; verifiedEquipmentRecoveryFields: number; equipmentRecoveryGaps: number };
};
