import type * as Engine from '@leyline/engine';
import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

type SceneCheck = { entity: string; field: string; case: string; expected: number | null; value: number | null; issue?: string };

export function auditSceneDamage(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: typeof Engine,
): {
  rows: SceneCheck[];
  baseRows: (SceneCheck & { expectedFinal: number | null; final: number | null; recipient: 'enemy' | 'character' })[];
  verified: Set<string>;
  baseVerified: Set<string>;
  gaps: { entity: string; field: string; issue: string }[];
  summary: { sceneDamageEvidenceRows: number; sceneDamageVerified: number; sceneDamageChecks: number; sceneDamageCheckFailures: number;
    sceneBaseVerified: number; sceneBaseChecks: number };
};
