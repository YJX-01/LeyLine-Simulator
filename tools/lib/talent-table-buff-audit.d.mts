import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface TalentTableBuffAuditRow {
  entity: string;
  field: string;
  attribute: string;
  sources: string[];
  expected: number;
  value: number | null;
  issue?: string;
}

export function auditTalentTableBuffs(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: TalentTableBuffAuditRow[];
  verified: Set<string>;
  summary: { talentTableBuffCases: number; talentTableBuffMismatches: number; verifiedTalentTableBuffDetails: number };
};
