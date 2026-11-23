import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export function auditVarkaChargedHands(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'evaluateStructuredHit'>,
): {
  rows: { entity: string; field: string; hit: string; sources: string[]; expected: number; value: number | null; status: string;
    probe: { party: string[]; stance: boolean; side: string; element: string; legacyHand?: string | null }; issue?: string }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; reason: string }[];
  summary: Record<string, number>;
};
