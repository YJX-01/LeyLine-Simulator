import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface AttributeDetailPointer {
  entity: string;
  field: string;
  sources: string[];
}

interface RemainingAttributeDetailRow extends AttributeDetailPointer {
  label: string;
  parameters: string[];
  output: string;
  rank: number;
  constellation: number;
  level: number;
  weapon: string;
  recipient: string;
  probe: Record<string, unknown>;
  scope: string;
  value: number | null;
  expected: number | null;
  status: string;
  baseline?: number | null;
  total?: number | null;
  issue?: string;
}

export function auditRemainingAttributeDetails(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' |
    'evaluateCombatBindings' | 'evaluateStructuredHit' | 'calculationEffectInstanceId'>,
): {
  rows: RemainingAttributeDetailRow[];
  verified: Set<string>;
  resolved: (AttributeDetailPointer & { resolved: string; remaining: string })[];
  gaps: (AttributeDetailPointer & { status: 'needs-review' | 'needs-evidence'; reason: string; softwareSources?: string[] })[];
  summary: {
    remainingAttributeDetailCases: number;
    remainingAttributeDetailMismatches: number;
    verifiedRemainingAttributeDetails: number;
    remainingAttributeDetailGaps: number;
  };
};
