import type * as engine from '@leyline/engine';
import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

export function auditAdditionalScenes(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  runtime: typeof engine,
): {
  rows: { entity: string; issue?: string }[];
  verified: Set<string>;
  summary: {
    additionalSceneClauses: number;
    additionalSceneChecks: number;
    additionalSceneCheckFailures: number;
    additionalSceneClausesVerified: number;
    additionalSceneEvidenceStatuses: Record<string, number>;
  };
};
