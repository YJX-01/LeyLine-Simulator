import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface ResourceEffectSource {
  entity: string;
  field: string;
  sources: string[];
}

interface ResourceEffectProbe extends ResourceEffectSource {
  clause: string;
  effectId: string;
  output: string;
  value: number | null;
  expected: number | null;
  probe?: Record<string, unknown>;
  status?: string;
  expectedStatus?: string;
  issue?: string;
}

export const characterResourceBuffIds: string[];
export function auditCharacterResourceBuffs(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'prepareStructuredBuilds' | 'createStructuredCombatContext' |
    'evaluateCombatBindings' | 'evaluateStructuredHit'>,
): {
  rows: ResourceEffectProbe[];
  verified: Set<string>;
  resolved: (ResourceEffectSource & { resolved: string; remaining: string })[];
  gaps: (ResourceEffectSource & { status: 'needs-evidence'; reason: string; softwareSources?: string[] })[];
  summary: {
    characterResourceBuffCases: number;
    characterResourceBuffMismatches: number;
    verifiedCharacterResourceBuffModifiers: number;
  };
};
