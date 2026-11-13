import { projectSchema, type CombatConditions, type CombatStateInterval, type Project } from '@leyline/schema';

/** Validate the complete edit before touching the current draft. */
export function setCombatStateInterval(project: Project, interval: CombatStateInterval): void {
  const intervals = [...(project.combatStates ?? [])];
  const index = intervals.findIndex(entry => entry.id === interval.id);
  if (index < 0) intervals.push(interval);
  else intervals[index] = interval;
  const parsed = projectSchema.parse({ ...project, combatStates: intervals });
  project.combatStates = parsed.combatStates;
}

export function removeCombatStateInterval(project: Project, id: string): void {
  if (project.combatStates) project.combatStates = project.combatStates.filter(interval => interval.id !== id);
}

export function setDamageStateOverride(project: Project, recordId: string, actor: string, values: CombatConditions | undefined): void {
  const record = project.timeline.find(entry => entry.id === recordId);
  if (record?.kind !== 'damage' || !record.damage) throw new Error('请选择已有的技能命中记录。');
  const damage = { ...record.damage };
  const overrides = (damage.stateOverrides ?? []).filter(override => override.actor !== actor);
  if (actor === record.actor) {
    if (values === undefined) delete damage.conditions;
    else damage.conditions = values;
  } else if (values !== undefined) overrides.push({ actor, values });
  if (overrides.length) damage.stateOverrides = overrides;
  else delete damage.stateOverrides;
  const parsed = projectSchema.parse({ ...project, timeline: project.timeline.map(entry => entry.id === recordId ? { ...entry, damage } : entry) });
  record.damage = parsed.timeline.find(entry => entry.id === recordId)!.damage;
}
