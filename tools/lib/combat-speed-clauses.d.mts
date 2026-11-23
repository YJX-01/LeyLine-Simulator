import type { StructuredCharacterDefinition, StructuredWeaponDefinition } from '@leyline/schema';
import type * as Engine from '@leyline/engine';

export const combatSpeedIds: string[];
export const combatSpeedPeerIds: string[];

interface SpeedClause {
  entity: string;
  field: string;
  sources: string[];
}

export function auditCombatSpeedClauses(entities: {
  characters: StructuredCharacterDefinition[];
  weapons: StructuredWeaponDefinition[];
}, engine: Pick<typeof Engine, 'prepareStructuredBuilds' | 'createStructuredCombatContext' | 'evaluateCombatBindings' |
  'projectCalculationEvent' | 'projectBuffContext'>): {
  rows: (SpeedClause & {
    modifierId: string;
    output: string;
    probe: { recipient: string; hitId: string; category: string; timeMs?: number; [key: string]: unknown };
    expected: number | null;
    value: number | null;
    status: string;
    issue?: string;
  })[];
  verified: Set<string>;
  resolved: (SpeedClause & { resolved: string; remaining: string })[];
  gaps: (SpeedClause & { reason: string })[];
  summary: {
    combatSpeedCases: number;
    combatSpeedMismatches: number;
    verifiedCombatSpeedFields: number;
    combatSpeedGaps: number;
  };
};
