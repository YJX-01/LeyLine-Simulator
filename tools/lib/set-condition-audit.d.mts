import type { ArtifactSetDefinition, CharacterDefinition, Project, WeaponDefinition } from '@leyline/schema';
import type { createRuntimeCatalog } from './runtime-catalog.mjs';

export interface HealingWindowCase {
  project: Project;
  expected: { actor: string; value: number }[];
}

export function auditSetConditions(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] },
  engine: typeof import('@leyline/engine'),
): { rows: { entity: string; actual: number | null; expected: number | null; issue?: string }[];
  summary: { setConditionScenarios: number; setConditionFailures: number } };

export function auditHealingWindows(
  catalog: Awaited<ReturnType<typeof createRuntimeCatalog>>,
  engine: typeof import('@leyline/engine'),
  onCase?: (project: Project, expected: HealingWindowCase['expected']) => void,
): Promise<{ summary: { setHealingScenarios: number; setHealingFailures: number } }>;
