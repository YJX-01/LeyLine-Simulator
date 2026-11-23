import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface TalentDetailCurrentRow {
  entity: string;
  field: string;
  attribute: string;
  unit: 'hp' | 'scalar' | 'count';
  rank: number;
  ascension: number;
  constellation: number;
  weapon: string;
  recipient: string;
  sources: string[];
  expected: number | null;
  value: number | null;
  status: string;
  issue?: string;
}

export function auditTalentDetailCurrent(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: TalentDetailCurrentRow[];
  verified: Set<string>;
  summary: { talentDetailCurrentCases: number; talentDetailCurrentMismatches: number; verifiedTalentDetailCurrentFields: number };
};
