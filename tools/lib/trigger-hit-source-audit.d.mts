import type { StructuredArtifactSetDefinition, StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const triggerHitSourceIds: string[];
export function auditTriggerHitSources(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[]; sets: StructuredArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'evaluateStructuredHit' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: { entity: string; field: string; sources: string[]; settings: object; value: number | null; expected: number | null; issue?: string }[];
  verified: Set<string>;
  summary: { triggerHitSourceCases: number; triggerHitSourceFailures: number; triggerHitSourceClausesVerified: number; triggerHitSourceOpen: number };
};
