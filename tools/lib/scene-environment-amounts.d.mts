import type * as Engine from '@leyline/engine';
import type { CharacterDefinition, WeaponDefinition } from '@leyline/schema';

type Identity = { entity: string; field: string };
type Scope = {
  sceneId: number;
  levelRevise: number;
  showLevel: number;
  levelConfigName: string;
  descTextMapHash: number;
  sourceRefs: string[];
};
type Observation = {
  reference: string;
  frame: string;
  author: string;
  publicationDate: string;
  version: string | null;
  versionSource: string | null;
  domain: string;
  difficulty: number;
  character: string;
  characterLevel: number;
  encounterLevel: number;
  clockRemainingMs: number;
  damage: number;
  trigger: string;
  targetIdentity: null;
  schedule: null;
};

export function auditSceneEnvironmentAmounts(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[] },
  engine: typeof Engine,
): {
  rows: (Identity & Scope & { dungeonId: number; value: null; referenceOnly?: Record<string, unknown> })[];
  verified: Set<string>;
  baseVerified: Set<string>;
  resolved: (Identity & { resolved: string[]; missingFields: string[]; remaining: string; evidence: Scope })[];
  gaps: (Identity & { issue: string })[];
  observations: Observation[];
  summary: {
    sceneEnvironmentAmountRows: number;
    sceneEnvironmentAmountVerified: number;
    sceneEnvironmentAmountBaseVerified: number;
    sceneEnvironmentAmountObservations: number;
    sceneEnvironmentAmountCheckFailures: number;
  };
};
