import { workbenchProjectSchema, type WorkbenchNode, type WorkbenchProject } from '@leyline/schema';

export function enableP3(project: WorkbenchProject): void {
  project.rulesVersion = 'workbench-p3';
}
export function newP3Node(op: WorkbenchNode['op'], first: string, record: string): WorkbenchNode {
  const id = crypto.randomUUID();
  switch (op) {
    case 'constant': return { id, op, quantity: { value: 1, unit: 'scalar' } };
    case 'input': return { id, op, key: 'attack', unit: 'attack' };
    case 'attribute': return { id, op, key: 'attack', unit: 'attack' };
    case 'capture': return { id, op, at: record, value: first, phase: 'before' };
    case 'history': return { id, op, mode: 'sum', startMs: 0, endMs: 6000 };
    case 'condition': return { id, op, key: '触发条件', yes: first, no: first };
    case 'game-damage': return { id, op };
    case 'unsupported': return { id, op, capability: 'probability' };
    default: return { id, op, left: first, right: first };
  }
}
export function parseP3Sample(input: unknown): WorkbenchProject {
  return workbenchProjectSchema.parse(JSON.parse(JSON.stringify(input)));
}
export function reviseEffect(project: WorkbenchProject, instanceId: string, disabled: boolean, value?: { value: number; unit: 'scalar' | 'attack' | 'damage' }): void {
  project.effectRevisions ??= [];
  const previous = project.effectRevisions.findIndex(entry => entry.instanceId === instanceId);
  const retained = value ?? (previous >= 0 ? project.effectRevisions[previous].value : undefined);
  const revision = { instanceId, disabled, ...(retained ? { value: retained } : {}) };
  if (previous < 0) project.effectRevisions.push(revision); else project.effectRevisions[previous] = revision;
}
