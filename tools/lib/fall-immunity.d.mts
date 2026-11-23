import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const fallImmunityIds: string[];

export function auditFallImmunity(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: {
    entity: string; clause: string; field: string; output: string; effect: string; sources: string[];
    probe: { recipient: string; onField: boolean | null; area: boolean | null; fallDamage: boolean | null;
      ownLeap: boolean | null | undefined; otherLeap: boolean; outgoingPlunge: boolean; label: string };
    expected: number | null; expectedStatus: string; value: number | null; status: string; issue?: string;
  }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; kind: string; sources: string[]; needed: string; reason: string }[];
  summary: { fallImmunityCases: number; fallImmunityMismatches: number; verifiedFallImmunity: number };
};
