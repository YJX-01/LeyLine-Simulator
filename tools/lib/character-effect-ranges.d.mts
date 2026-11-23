import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export function auditCharacterEffectRanges(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'evaluateTimeline'>,
): {
  rows: {
    entity: string;
    field: string;
    effect: string;
    output: string;
    value: number | null;
    expected: number | null;
    probe?: { id: string; actor: string; hitId: string; expected: number; onField: boolean };
    sources: string[];
    issue?: string;
  }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; kind: string; sources: string[]; needed: string; reason: string }[];
  summary: { characterEffectRangeCases: number; characterEffectRangeMismatches: number; verifiedCharacterEffectRanges: number };
};
