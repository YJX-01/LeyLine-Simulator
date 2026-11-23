import type { ArtifactSetDefinition, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface CalculatorModifierChoice {
  entity: string;
  field: string;
  id: string;
  target: string;
  listed: boolean;
  role?: string;
}

interface ModifierEvidenceCase {
  actual: number;
  expected: number;
  settings?: unknown;
}

interface ModifierEvidence {
  key: string;
  entity: string;
  field: string;
  id: string;
  modifier: number;
  target: string;
  audit: string;
  actual: number;
  expected: number;
  refs: string[];
  scope: string;
  cases: ModifierEvidenceCase[];
}

export function registeredModifierEvidence(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] },
  results: { calculator: { buffs: CalculatorModifierChoice[] }; [audit: string]: unknown },
): ModifierEvidence[];
