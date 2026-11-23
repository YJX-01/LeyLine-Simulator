import type { ArtifactSetDefinition, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface EquipmentHealingGap {
  entity: string;
  field: string;
  pieces?: number;
  sources: string[];
  reason: string;
}

interface EquipmentHealingRow extends Omit<EquipmentHealingGap, 'reason'> {
  attribute: 'equipmentHealing' | 'equipmentBaseHealingTotal' | 'equipmentBaseHealingTick' | 'directEnergyRestored'
    | 'incomingHealingBonus' | 'hp' | 'energyRecharge';
  effect?: string;
  probe: string;
  recipient: string;
  refinement: number;
  unit: string;
  expected: number | null;
  value: number | null;
  state?: string;
  issue?: string;
}

export const equipmentHealingCharacterIds: string[];
export const equipmentHealingWeaponIds: string[];
export const equipmentHealingSetIds: string[];
export function auditEquipmentHealing(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'
    | 'calculationEffectInstanceId' | 'effectRecipientMatches' | 'grantedBuildEffects'>,
): {
  rows: EquipmentHealingRow[];
  verified: Set<string>;
  gaps: EquipmentHealingGap[];
  summary: { equipmentHealingCases: number; equipmentHealingMismatches: number; verifiedEquipmentHealingFields: number; equipmentHealingGaps: number };
};
