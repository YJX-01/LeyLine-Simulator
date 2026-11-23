import type * as Engine from '@leyline/engine';
import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const ifaRescueReactionCharacterIds: string[];
export const ifaRescueReactionWeaponIds: string[];
export function auditIfaRescueReactions(entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: typeof Engine): {
    rows: { entity: string; field: string; probe: { family: string; points: number | null; rank: number; ascension: number };
      expected: number | null; value: number | null; status: string; issue?: string }[];
    verified: Set<string>;
    resolved: { entity: string; field: string; resolved: string; remaining: string }[];
    gaps: { entity: string; field: string; reason: string }[];
    summary: Record<string, number>;
  };
