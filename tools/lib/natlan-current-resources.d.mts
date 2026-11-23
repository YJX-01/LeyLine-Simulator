import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';

export const natlanCurrentCharacterIds: string[];
export const natlanCurrentWeaponIds: string[];

export function auditNatlanCurrentResources(
  entities: { characters: StructuredCharacterDefinition[]; weapons: StructuredWeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): {
  rows: { entity: string; clause: string; field: string; output: string; effect: string; unit: string; sources: string[];
    probe: { label: string; owner: string; recipient: string; eventActor: string; area: boolean | null; scene: boolean | null };
    expected: number | null; expectedStatus: string; value: number | null; status: string; issue?: string }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; status: string; reason: string; sources: string[] }[];
  summary: { natlanCurrentResourceCases: number; natlanCurrentResourceMismatches: number; verifiedNatlanCurrentResources: number };
};
