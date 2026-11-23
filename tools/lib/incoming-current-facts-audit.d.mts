import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface IncomingAuditRow {
  entity: string;
  field: string;
  attribute: string;
  sources: string[];
  expected: number;
  value: number | null;
  issue?: string;
}

export function auditIncomingCurrentFacts(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: IncomingAuditRow[];
  verified: Set<string>;
  summary: { incomingCurrentCases: number; incomingCurrentMismatches: number; verifiedIncomingClauses: number };
};
