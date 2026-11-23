import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface VariableWeaponModifierPointer {
  entity: string;
  field: string;
  clause: string;
  id: string;
  output: 'attribute.attackPercent';
  sources: string[];
}

interface VariableWeaponConditionRow extends VariableWeaponModifierPointer {
  rank: number;
  holder: string;
  recipient: string;
  onField: boolean;
  state: string | null;
  input: number | null;
  repeat: boolean;
  value: number | null;
  actual: number | null;
  expected: number | null;
  total: number | null;
  expectedTotal: number | null;
  effects: string[];
  issue?: string;
}

export function auditVariableWeaponConditions(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: VariableWeaponConditionRow[];
  verified: Set<string>;
  resolved: (VariableWeaponModifierPointer & { resolved: string })[];
  gaps: (VariableWeaponModifierPointer & { reason: string })[];
  summary: {
    variableWeaponConditionCases: number;
    variableWeaponConditionMismatches: number;
    verifiedVariableWeaponConditions: number;
    variableWeaponConditionGaps: number;
  };
};
