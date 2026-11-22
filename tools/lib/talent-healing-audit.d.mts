import type { Project } from '@leyline/schema';
import type { createRuntimeCatalog } from './runtime-catalog.mjs';

export interface HealingExpectation {
  source: string;
  recipient: string;
  status: 'applied' | 'excluded' | 'unknown';
  healing: number | null;
}

export function auditTalentHealing(
  catalog: Awaited<ReturnType<typeof createRuntimeCatalog>>,
  engine: typeof import('@leyline/engine'),
  onCase?: (project: Project, expected: HealingExpectation[], bubble?: number) => void,
): Promise<{ summary: { verifiedTalentHeals: number; talentHealingScenarios: number; talentHealingFailures: number } }>;
