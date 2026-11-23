import type { ArtifactSetDefinition, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface HealingSource {
  entity: string;
  field: string;
  sources: string[];
  output?: 'attribute.equipmentHealing';
}

interface HealingCase extends HealingSource {
  recipient: string;
  level: number;
  ascension: number;
  rank?: number;
  constellation?: number;
  elementalMastery?: number;
  stacks?: number;
  onField?: boolean;
  ownerHp?: number | null;
  recipientHp?: number | null;
  outgoing?: number;
  incoming?: number;
  triggered?: boolean | null;
  applied?: boolean | null;
  expected: number | null;
  value: number | null;
  expectedStatus: string;
  actualStatus: string;
  expectedBase: number | null;
  actualBase: number | null;
  missing: string[];
  issue?: string;
}

export const conditionalHealingCharacterIds: string[];
export const conditionalHealingWeaponIds: string[];
export const conditionalHealingSetIds: string[];

export function auditConditionalHealingSources(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'
    | 'calculationEffectInstanceId' | 'grantedBuildEffects' | 'evaluateTimeline'>,
): Promise<{
  rows: HealingCase[];
  verified: Set<string>;
  resolved: Array<HealingSource & { resolved: string; remaining: string | null }>;
  gaps: Array<HealingSource & { reason: string }>;
  summary: { conditionalHealingCases: number; conditionalHealingMismatches: number; verifiedConditionalHealingFields: number; conditionalHealingGaps: number };
}>;
