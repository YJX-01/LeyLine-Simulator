import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

type Detail = { entity: string; field: string; label: string; template: string; sources: string[] };
type Row = Detail & { classification: string; hit?: string; hitField?: string; value?: number | null; expected?: number;
  repetitions?: number; constellation?: number; locked?: number | null; active?: number | null; reason?: string; issue?: string };

export function auditTalentHitVariants(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'evaluateStructuredHit'>,
): {
  rows: Row[];
  verified: Set<string>;
  resolved: (Detail & { hits: string[]; resolved: string })[];
  gaps: (Detail & { reason: string })[];
  summary: { talentHitVariantCases: number; talentHitVariantMismatches: number; verifiedTalentHitVariantFields: number;
    talentHitVariantGaps: number; talentHitVariantResolvedDetails: number };
};
