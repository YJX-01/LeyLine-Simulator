import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export function auditYanfeiSealStamina(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' | 'evaluateStructuredHit'>,
): {
  rows: {
    entity: string; clause: string; field: string; effect: string; output: string; sources: string[];
    probe: { label: string; constellation: number; held: number | null; hitId?: string; resonance: boolean; recipient: string };
    actual: number | null; value: number | null; status: string; expected: number | null; expectedStatus: string; contribution: number | null; issue?: string;
  }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; sources: string[]; resolved: string }[];
  gaps: { entity: string; field: string; kind: string; sources: string[]; needed: string; reason: string }[];
  summary: { yanfeiSealStaminaCases: number; yanfeiSealStaminaMismatches: number; verifiedYanfeiSealStamina: number };
};
