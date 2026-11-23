import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface ShieldGrantAuditRow {
  entity: string;
  field: string;
  output: string;
  probe: object;
  sources: string[];
  expected: number | null;
  value: number | null;
  status: string;
  issue?: string;
}

export const remainingShieldGrantIds: string[];
export function auditRemainingShieldGrants(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: ShieldGrantAuditRow[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; reason: string }[];
  summary: { remainingShieldGrantCases: number; remainingShieldGrantMismatches: number; verifiedRemainingShieldGrants: number };
};
