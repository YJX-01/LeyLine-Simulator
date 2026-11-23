import type { ArtifactSetDefinition, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

interface EventGrantProbe {
  entity: string;
  field: string;
  pointer?: string;
  healId?: string;
  output?: string;
  probe?: { title?: string; [key: string]: unknown };
  sources: string[];
  status?: string;
  value?: number | null;
  base?: number | null;
  expected?: number | null;
  expectedStatus?: string;
  expectedBase?: number | null;
  missing?: string[];
  issue?: string;
}

export const remainingEventGrantIds: string[];
export const remainingEventGrantSetIds: string[];
export function auditRemainingEventGrants(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets?: ArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'evaluateTimeline' | 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings'>,
): Promise<{
  rows: EventGrantProbe[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; status: string; reason: string; sources: string[] }[];
  summary: { remainingEventGrantCases: number; remainingEventGrantFailures: number; remainingEventGrantClauses: number };
}>;
