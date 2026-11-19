import { elements, type Enemy, type Project } from '@leyline/schema';

export function defaultEnemy(): Enemy {
  return { level: 90, resistances: Object.fromEntries(elements.map(element => [element, 0.1])) as Enemy['resistances'], defenseReduction: 0, defenseIgnore: 0 };
}

export function setDamageSelected(project: Project, id: string, selected: boolean): void {
  const ids = project.objective.damageIds ?? project.timeline.filter(record => record.kind === 'damage').map(record => record.id);
  const next = new Set(ids);
  if (selected) next.add(id); else next.delete(id);
  project.objective.damageIds = [...next];
}

export function removeTimelineRecord(project: Project, id: string): void {
  project.timeline = project.timeline.filter(record => record.id !== id);
  if (project.objective.damageIds) project.objective.damageIds = project.objective.damageIds.filter(selected => selected !== id);
}
