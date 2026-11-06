import { workbenchProjectSchema, type WorkbenchProject } from '../../src/schema/src/index';
import ordinary from '../../fixtures/workbench/ordinary.json';

export type AcceptanceCase = 'weapon-a' | 'weapon-b' | 'attack-1100' | 'second-hit';
export const acceptanceCases: { id: AcceptanceCase; label: string; expected: number; calculation: string }[] = [
  { id: 'weapon-a', label: '武器甲 · 区间加成', expected: 4400, calculation: '1000 × 2 × 1.2 + 1000 × 2 = 4400' },
  { id: 'weapon-b', label: '武器乙 · 无加成', expected: 4000, calculation: '1000 × 2 + 1000 × 2 = 4000' },
  { id: 'attack-1100', label: '武器甲 · 攻击 1100', expected: 4840, calculation: '1100 × 2 × 1.2 + 1100 × 2 = 4840' },
  { id: 'second-hit', label: '只选第二次命中', expected: 2000, calculation: '目标：1000 × 2 = 2000；全轴仍为 4400' },
];

export function createWorkbenchProject(variant: AcceptanceCase = 'weapon-a'): WorkbenchProject {
  const project = workbenchProjectSchema.parse(ordinary);
  const actor = project.candidate.actors[0];
  if (variant === 'weapon-b') actor.weapon = 'weapon-b';
  if (variant === 'attack-1100') actor.inputs.attack.value = 1100;
  if (variant === 'second-hit') project.objective.damageIds = ['hit-6'];
  return project;
}

