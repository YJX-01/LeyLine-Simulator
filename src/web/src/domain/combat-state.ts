import { putHitFact, subjectFacts, combatStateFields, projectSchema, type CombatConditions, type CombatStateInterval, type Project } from '@leyline/schema';

/** Validate the complete edit before touching the current draft. */
export function setCombatStateInterval(project: Project, interval: CombatStateInterval): void {
  const intervals = [...(project.combatStates ?? [])];
  const index = intervals.findIndex(entry => entry.id === interval.id);
  if (index < 0) intervals.push(interval);
  else intervals[index] = interval;
  const parsed = projectSchema.parse({ ...project, combatStates: intervals });
  project.combatStates = parsed.combatStates;
}

export function setDamageStateOverride(project: Project, recordId: string, actor: string, values: CombatConditions | undefined): void {
  const record = project.timeline.find(entry => entry.id === recordId);
  if (record?.kind !== 'damage' || !record.damage) throw new Error('请选择已有的技能命中记录。');
  const facts = structuredClone(record.damage.facts ?? []);
  const subject = { kind: 'actor' as const, id: actor };
  const previous = subjectFacts(facts, subject);
  for (const key of combatStateFields) {
    if (previous) delete previous[key];
    const value = values?.[key];
    if (value !== undefined) putHitFact(facts, subject, key, value === null ? null : typeof value === 'boolean'
      ? { kind: 'boolean', value } : { kind: 'quantity', unit: 'scalar', value });
  }
  const damage = { ...record.damage, facts: facts.filter(row => Object.keys(row.values).length) };
  const parsed = projectSchema.parse({ ...project, timeline: project.timeline.map(entry => entry.id === recordId ? { ...entry, damage } : entry) });
  record.damage = parsed.timeline.find(entry => entry.id === recordId)!.damage;
}
