import type { ArtifactSetDefinition, CharacterDefinition, WeaponDefinition } from '@leyline/schema';

export const columbinaRevivalCharacterIds: string[];
export const columbinaRevivalWeaponIds: string[];
export const columbinaRevivalSetIds: string[];
export function auditColumbinaRevival(
  entities: { characters: CharacterDefinition[]; weapons: WeaponDefinition[]; sets: ArtifactSetDefinition[] },
  engine: Pick<typeof import('@leyline/engine'), 'evaluateTimeline'>,
): Promise<{
  rows: { entity: string; field: string; pointer: string; healId: string; output: string; sources: string[]; issue?: string;
    probe?: { title: string; friendship: number | null; self: boolean; bonus: boolean }; status?: string;
    value?: number | null; base?: number | null; expected?: number | null; expectedBase?: number | null; expectedStatus?: string; missing?: string[] }[];
  verified: Set<string>;
  resolved: { entity: string; field: string; resolved: string; remaining: string }[];
  gaps: { entity: string; field: string; status: string; reason: string; sources: string[] }[];
  summary: { columbinaRevivalCases: number; columbinaRevivalFailures: number; columbinaRevivalClauses: number };
}>;
