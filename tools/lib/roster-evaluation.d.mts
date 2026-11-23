import type { ArtifactSetDefinition, Build, CalculationFact, CharacterDefinition, DamageRequest, WeaponDefinition } from '@leyline/schema';

export interface RosterReplayQuery {
  label: string;
  build: Build;
  damage: DamageRequest;
  expected: number | null;
  teammate?: Build;
  additionalMembers?: Build[];
  capture?: { skillId: string; phase: 'before' | 'after'; facts?: DamageRequest['facts'] };
  cast?: { skillId: string; delayMs: number };
}

type Entities = { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] };
export function rosterEvaluation(entities: Entities, engine: typeof import('@leyline/engine'), onQuery?: (query: RosterReplayQuery) => void): { summary: { evaluated: number; compared: number } };
export function auditPublicScenes(entities: Entities, engine: typeof import('@leyline/engine')): {
  rows: { entity: string; target: string; probe?: string; expectedDelta?: number; expected?: number | null; input?: Record<string, CalculationFact>;
    recipient?: string; category?: string; onField?: boolean; timeMs?: number }[];
};

export function rosterEquipmentEvaluation(
  entities: Entities,
  engine: typeof import('@leyline/engine'),
  observationUnits: typeof import('@leyline/schema').combatObservationUnits,
  onQuery?: (query: RosterReplayQuery) => void,
): { summary: { weaponRefinementsEvaluated: number; setThresholdsEvaluated: number } };
