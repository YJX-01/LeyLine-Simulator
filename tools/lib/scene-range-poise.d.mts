import type * as Engine from '@leyline/engine';
import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

export function auditSceneRangePoise(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: typeof Engine,
): {
  rows: {
    entity: string;
    field: string;
    case?: string;
    actor?: string;
    family?: string;
    layers?: number | null;
    expected?: number | null;
    value?: number | null;
    contribution?: number | null;
    issue?: string;
  }[];
  verified: Set<string>;
  summary: {
    sceneRangePoiseEvidenceRows: number;
    sceneRangePoiseVerified: number;
    sceneRangePoiseChecks: number;
    sceneRangePoiseCheckFailures: number;
  };
};
