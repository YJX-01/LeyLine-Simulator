import { workbenchProjectSchema, type WorkbenchProject } from '@leyline/schema';
import { evaluateWorkbench } from '@leyline/engine';
import ordinary from '../../../../fixtures/workbench/ordinary.json';

export type AcceptanceCase = 'weapon-a' | 'weapon-b' | 'attack-1100' | 'second-hit';
export const acceptanceCases: { id: AcceptanceCase; label: string; expected: number; calculation: string }[] = [
  { id: 'weapon-a', label: '武器 A · 区间加成', expected: 4400, calculation: '1000 × 2 × 1.2 + 1000 × 2 = 4400' },
  { id: 'weapon-b', label: '武器 B · 无加成', expected: 4000, calculation: '1000 × 2 + 1000 × 2 = 4000' },
  { id: 'attack-1100', label: '武器 A · 攻击 1100', expected: 4840, calculation: '1100 × 2 × 1.2 + 1100 × 2 = 4840' },
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

export function importWorkbenchProject(content: string): WorkbenchProject {
  let input: unknown;
  try { input = JSON.parse(content); } catch { throw new Error('文件不是有效的 JSON，当前项目保持不变。'); }
  const parsed = workbenchProjectSchema.safeParse(input);
  if (!parsed.success) throw new Error(`项目格式无效：${parsed.error.issues.slice(0, 3).map(issue => `${issue.path.join('.')}: ${issue.message}`).join('；')}。当前项目保持不变。`);
  const result = evaluateWorkbench(parsed.data);
  if (result.status === 'invalid') throw new Error(`项目引用或计算规则无效：${result.diagnostics.slice(0, 3).map(d => `${d.path}: ${d.message}`).join('；')}。当前项目保持不变。`);
  return parsed.data;
}

export function setDamageSelected(project: WorkbenchProject, id: string, selected: boolean): void {
  const ids = project.objective.damageIds ?? project.timeline.filter(record => record.kind === 'damage').map(record => record.id);
  const next = new Set(ids);
  if (selected) next.add(id); else next.delete(id);
  project.objective.damageIds = [...next];
}

export function removeTimelineRecord(project: WorkbenchProject, id: string): void {
  project.timeline = project.timeline.filter(record => record.id !== id);
  if (project.objective.damageIds) project.objective.damageIds = project.objective.damageIds.filter(selected => selected !== id);
}

export function nextRecordId(project: WorkbenchProject): string {
  let index = project.timeline.length + 1;
  while (project.timeline.some(record => record.id === `record-${index}`)) index++;
  return `record-${index}`;
}
