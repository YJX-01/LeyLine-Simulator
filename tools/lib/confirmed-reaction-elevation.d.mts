import type * as Engine from '@leyline/engine';
import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const confirmedReactionElevationIds: string[];
export const confirmedReactionElevationPeerIds: string[];
export const confirmedReactionElevationWeaponIds: string[];
export function auditConfirmedReactionElevation(entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: typeof Engine): {
    rows: { entity: string; field: string; probe: { hitId?: string }; expected: number | null; expectedFactor?: number | null;
      value: number | null; factor?: number | null; status: string; issue?: string }[];
    verified: Set<string>;
    resolved: { entity: string; field: string; resolved: string; remaining: string }[];
    gaps: { entity: string; field: string; reason: string }[];
    summary: Record<string, number>;
  };
