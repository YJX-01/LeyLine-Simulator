import type { WorkbenchProject } from '../../src/schema/src/index';

export function reviseEffect(project: WorkbenchProject, instanceId: string, disabled: boolean, value?: { value: number; unit: 'scalar' | 'attack' | 'damage' }): void {
  project.effectRevisions ??= [];
  const previous = project.effectRevisions.findIndex(entry => entry.instanceId === instanceId);
  const retained = value ?? (previous >= 0 ? project.effectRevisions[previous].value : undefined);
  const revision = { instanceId, disabled, ...(retained ? { value: retained } : {}) };
  if (previous < 0) project.effectRevisions.push(revision); else project.effectRevisions[previous] = revision;
}
